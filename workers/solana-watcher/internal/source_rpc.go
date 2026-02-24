package internal

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type SolanaRpcSource struct {
	RPCURL      string
	HTTPClient  *http.Client
	RouteStore  RouteStore
	TokenMints  map[string]string // token -> mint pubkey (base58)
	TreasuryATAs map[string]string // token -> treasury ATA (base58)
	ProgramID   string
	Chain       string
	Limit       int
}

type rpcRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      int         `json:"id"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params"`
}

type rpcResponse struct {
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

type signatureItem struct {
	Signature string `json:"signature"`
	Slot      int64  `json:"slot"`
	Err       any    `json:"err"`
}

type tokenAmount struct {
	Amount string `json:"amount"`
}

type tokenBalance struct {
	Owner         string      `json:"owner"`
	Mint          string      `json:"mint"`
	UITokenAmount tokenAmount `json:"uiTokenAmount"`
}

type transactionResult struct {
	Meta struct {
		Err              any            `json:"err"`
		LogMessages      []string       `json:"logMessages"`
		PreTokenBalances  []tokenBalance `json:"preTokenBalances"`
		PostTokenBalances []tokenBalance `json:"postTokenBalances"`
	} `json:"meta"`
}

var paymentAcceptedEventDiscriminator = []byte{30, 234, 73, 123, 52, 141, 189, 63}

func (s SolanaRpcSource) Poll(ctx context.Context, cursor string) ([]FundingCandidate, string, error) {
	if s.RPCURL == "" {
		return nil, cursor, fmt.Errorf("solana rpc url is required")
	}

	limit := s.Limit
	if limit <= 0 {
		limit = 100
	}

	latestSlot, err := s.getSlot(ctx)
	if err != nil {
		return nil, cursor, fmt.Errorf("get slot: %w", err)
	}

	current, err := strconv.ParseInt(cursor, 10, 64)
	if err != nil {
		current = 0
	}
	if latestSlot <= current {
		return nil, strconv.FormatInt(current, 10), nil
	}

	if strings.TrimSpace(s.ProgramID) != "" && len(s.TreasuryATAs) > 0 {
		candidates, err := s.pollProgramPayments(ctx, current, limit)
		if err != nil {
			return nil, cursor, err
		}
		return candidates, strconv.FormatInt(latestSlot, 10), nil
	}

	candidates, err := s.pollLegacyRouteAddresses(ctx, current, limit)
	if err != nil {
		return nil, cursor, err
	}
	return candidates, strconv.FormatInt(latestSlot, 10), nil
}

func (s SolanaRpcSource) pollProgramPayments(ctx context.Context, current int64, limit int) ([]FundingCandidate, error) {
	candidates := make([]FundingCandidate, 0)
	seenSignatures := map[string]bool{}

	for token, treasuryATA := range s.TreasuryATAs {
		if treasuryATA == "" {
			continue
		}

		sigs, err := s.getSignaturesForAddress(ctx, treasuryATA, limit)
		if err != nil {
			if isInvalidRouteAddressError(err) {
				continue
			}
			return nil, fmt.Errorf("get signatures for treasury ata %s (%s): %w", treasuryATA, token, err)
		}

		for _, sig := range sigs {
			if sig.Err != nil || sig.Slot <= current {
				continue
			}
			if seenSignatures[sig.Signature] {
				continue
			}
			seenSignatures[sig.Signature] = true

			tx, err := s.getTransaction(ctx, sig.Signature)
			if err != nil {
				continue
			}

			events := extractProgramPaymentCandidates(tx, programPaymentParseInput{
				Chain:       s.Chain,
				TxHash:      sig.Signature,
				ProgramID:   s.ProgramID,
				TokenMints:  s.TokenMints,
				TreasuryATAs: s.TreasuryATAs,
			})
			candidates = append(candidates, events...)
		}
	}

	return candidates, nil
}

func (s SolanaRpcSource) pollLegacyRouteAddresses(ctx context.Context, current int64, limit int) ([]FundingCandidate, error) {
	if s.RouteStore == nil {
		return nil, nil
	}

	routes, err := s.RouteStore.ListActiveRoutes(ctx, s.Chain)
	if err != nil {
		return nil, err
	}

	candidates := make([]FundingCandidate, 0)
	for _, route := range routes {
		expectedMint := s.TokenMints[strings.ToUpper(route.Token)]
		if expectedMint == "" {
			continue
		}

		sigs, err := s.getSignaturesForAddress(ctx, route.DepositAddress, limit)
		if err != nil {
			if isInvalidRouteAddressError(err) {
				continue
			}
			return nil, fmt.Errorf("get signatures for %s: %w", route.DepositAddress, err)
		}

		for _, sig := range sigs {
			if sig.Err != nil || sig.Slot <= current {
				continue
			}

			tx, err := s.getTransaction(ctx, sig.Signature)
			if err != nil {
				continue
			}

			amountUSD, ok := extractTokenCreditUSD(tx, route.DepositAddress, expectedMint)
			if !ok || amountUSD <= 0 {
				continue
			}

			candidates = append(candidates, FundingCandidate{
				Chain:          s.Chain,
				Token:          strings.ToUpper(route.Token),
				TxHash:         sig.Signature,
				LogIndex:       0,
				DepositAddress: route.DepositAddress,
				AmountUSD:      amountUSD,
				Finalized:      true,
			})
		}
	}

	return candidates, nil
}

func isInvalidRouteAddressError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "invalid param")
}

type programPaymentParseInput struct {
	Chain        string
	TxHash       string
	ProgramID    string
	TokenMints   map[string]string
	TreasuryATAs map[string]string
}

func extractProgramPaymentCandidates(tx transactionResult, in programPaymentParseInput) []FundingCandidate {
	if tx.Meta.Err != nil {
		return nil
	}
	if strings.TrimSpace(in.ProgramID) == "" {
		return nil
	}

	logs := tx.Meta.LogMessages
	if len(logs) == 0 {
		return nil
	}
	programSeen := false
	for _, line := range logs {
		if strings.Contains(line, "Program "+in.ProgramID+" ") {
			programSeen = true
			break
		}
	}
	if !programSeen {
		return nil
	}

	mintToToken := make(map[string]string, len(in.TokenMints))
	for token, mint := range in.TokenMints {
		if mint == "" {
			continue
		}
		mintToToken[mint] = strings.ToUpper(token)
	}

	candidates := make([]FundingCandidate, 0)
	eventIndex := 0
	for _, line := range logs {
		const prefix = "Program data: "
		idx := strings.Index(line, prefix)
		if idx < 0 {
			continue
		}

		encoded := strings.TrimSpace(line[idx+len(prefix):])
		raw, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			continue
		}
		candidate, ok := decodePaymentAcceptedEvent(raw, eventIndex, mintToToken, in)
		if !ok {
			continue
		}
		candidates = append(candidates, candidate)
		eventIndex++
	}

	return candidates
}

func decodePaymentAcceptedEvent(raw []byte, eventIndex int, mintToToken map[string]string, in programPaymentParseInput) (FundingCandidate, bool) {
	// discriminator + u64 + pubkey + pubkey + u64 + [32] + i64 = 128 bytes
	if len(raw) < 128 {
		return FundingCandidate{}, false
	}
	if !bytes.Equal(raw[:8], paymentAcceptedEventDiscriminator) {
		return FundingCandidate{}, false
	}

	offset := 8
	paymentID := binary.LittleEndian.Uint64(raw[offset : offset+8])
	offset += 8
	payerBytes := raw[offset : offset+32]
	offset += 32
	mintBytes := raw[offset : offset+32]
	offset += 32
	amountBaseUnits := binary.LittleEndian.Uint64(raw[offset : offset+8])
	offset += 8
	externalRefHash := raw[offset : offset+32]
	offset += 32
	_ = int64(binary.LittleEndian.Uint64(raw[offset : offset+8])) // timestamp currently unused

	if amountBaseUnits == 0 {
		return FundingCandidate{}, false
	}

	mint := base58Encode(mintBytes)
	token, ok := mintToToken[mint]
	if !ok {
		return FundingCandidate{}, false
	}

	treasuryATA := in.TreasuryATAs[token]
	if treasuryATA == "" {
		return FundingCandidate{}, false
	}

	amountUSD := float64(amountBaseUnits) / 1_000_000.0
	if amountUSD <= 0 {
		return FundingCandidate{}, false
	}

	return FundingCandidate{
		Chain:          in.Chain,
		Token:          token,
		TxHash:         in.TxHash,
		LogIndex:       eventIndex,
		ReferenceHash:  hex.EncodeToString(externalRefHash),
		DepositAddress: treasuryATA,
		AmountUSD:      amountUSD,
		Finalized:      true,
		Metadata: map[string]any{
			"payerAddress":        base58Encode(payerBytes),
			"paymentId":           strconv.FormatUint(paymentID, 10),
			"referenceHash":       hex.EncodeToString(externalRefHash),
			"verificationSource":  "solana_watcher_fallback",
		},
	}, true
}

const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

func base58Encode(input []byte) string {
	if len(input) == 0 {
		return ""
	}
	digits := []int{0}
	for _, b := range input {
		carry := int(b)
		for i := 0; i < len(digits); i++ {
			value := digits[i]*256 + carry
			digits[i] = value % 58
			carry = value / 58
		}
		for carry > 0 {
			digits = append(digits, carry%58)
			carry /= 58
		}
	}

	leadingZeros := 0
	for leadingZeros < len(input) && input[leadingZeros] == 0 {
		leadingZeros++
	}

	var out strings.Builder
	for i := 0; i < leadingZeros; i++ {
		out.WriteByte('1')
	}
	for i := len(digits) - 1; i >= 0; i-- {
		out.WriteByte(base58Alphabet[digits[i]])
	}
	return out.String()
}

func (s SolanaRpcSource) getSlot(ctx context.Context) (int64, error) {
	var out int64
	if err := s.rpcCall(ctx, "getSlot", []interface{}{map[string]interface{}{"commitment": "finalized"}}, &out); err != nil {
		return 0, err
	}
	return out, nil
}

func (s SolanaRpcSource) getSignaturesForAddress(ctx context.Context, address string, limit int) ([]signatureItem, error) {
	var out []signatureItem
	if err := s.rpcCall(
		ctx,
		"getSignaturesForAddress",
		[]interface{}{address, map[string]interface{}{"limit": limit, "commitment": "finalized"}},
		&out,
	); err != nil {
		return nil, err
	}
	return out, nil
}

func (s SolanaRpcSource) getTransaction(ctx context.Context, signature string) (transactionResult, error) {
	var out transactionResult
	if err := s.rpcCall(
		ctx,
		"getTransaction",
		[]interface{}{signature, map[string]interface{}{"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0, "commitment": "finalized"}},
		&out,
	); err != nil {
		return transactionResult{}, err
	}
	return out, nil
}

func (s SolanaRpcSource) rpcCall(ctx context.Context, method string, params interface{}, out interface{}) error {
	client := s.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 8 * time.Second}
	}

	reqBody, err := json.Marshal(rpcRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  method,
		Params:  params,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.RPCURL, bytes.NewReader(reqBody))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("rpc status %d", resp.StatusCode)
	}

	var rpcResp rpcResponse
	if err := json.NewDecoder(resp.Body).Decode(&rpcResp); err != nil {
		return err
	}
	if rpcResp.Error != nil {
		return fmt.Errorf("rpc error %d: %s", rpcResp.Error.Code, rpcResp.Error.Message)
	}

	if out == nil {
		return nil
	}
	return json.Unmarshal(rpcResp.Result, out)
}

func extractTokenCreditUSD(tx transactionResult, owner string, mint string) (float64, bool) {
	key := strings.ToLower(strings.TrimSpace(owner)) + "|" + strings.TrimSpace(mint)

	pre := map[string]*big.Int{}
	for _, balance := range tx.Meta.PreTokenBalances {
		if strings.ToLower(strings.TrimSpace(balance.Owner))+"|"+strings.TrimSpace(balance.Mint) != key {
			continue
		}
		value, ok := new(big.Int).SetString(balance.UITokenAmount.Amount, 10)
		if !ok {
			continue
		}
		pre[key] = value
	}

	post := map[string]*big.Int{}
	for _, balance := range tx.Meta.PostTokenBalances {
		if strings.ToLower(strings.TrimSpace(balance.Owner))+"|"+strings.TrimSpace(balance.Mint) != key {
			continue
		}
		value, ok := new(big.Int).SetString(balance.UITokenAmount.Amount, 10)
		if !ok {
			continue
		}
		post[key] = value
	}

	postValue, postOK := post[key]
	if !postOK {
		return 0, false
	}

	preValue := big.NewInt(0)
	if existing, ok := pre[key]; ok {
		preValue = existing
	}

	delta := new(big.Int).Sub(postValue, preValue)
	if delta.Sign() <= 0 {
		return 0, false
	}

	f := new(big.Float).SetInt(delta)
	usd := new(big.Float).Quo(f, big.NewFloat(1_000_000))
	result, _ := usd.Float64()
	return result, true
}
