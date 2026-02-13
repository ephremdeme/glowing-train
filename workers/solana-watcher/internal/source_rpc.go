package internal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type SolanaRpcSource struct {
	RPCURL     string
	HTTPClient *http.Client
	RouteStore RouteStore
	TokenMints map[string]string
	Chain      string
	Limit      int
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
		PreTokenBalances  []tokenBalance `json:"preTokenBalances"`
		PostTokenBalances []tokenBalance `json:"postTokenBalances"`
	} `json:"meta"`
}

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

	routes, err := s.RouteStore.ListActiveRoutes(ctx, s.Chain)
	if err != nil {
		return nil, cursor, err
	}

	candidates := make([]FundingCandidate, 0)
	for _, route := range routes {
		expectedMint := s.TokenMints[strings.ToUpper(route.Token)]
		if expectedMint == "" {
			continue
		}

		sigs, err := s.getSignaturesForAddress(ctx, route.DepositAddress, limit)
		if err != nil {
			return nil, cursor, fmt.Errorf("get signatures for %s: %w", route.DepositAddress, err)
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

	return candidates, strconv.FormatInt(latestSlot, 10), nil
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
