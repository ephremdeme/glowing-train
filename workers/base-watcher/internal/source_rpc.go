package internal

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

type EvmRpcSource struct {
	RPCURL                 string
	HTTPClient             *http.Client
	RouteStore             RouteStore
	TokenContracts         map[string]string
	Chain                  string
	FinalizedConfirmations int  // number of confirmations to consider finalized (default: 12)
	FactoryLevelScan       bool // if true, also scan token contracts globally for QR/manual deposits
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

type evmLog struct {
	TxHash      string   `json:"transactionHash"`
	LogIndex    string   `json:"logIndex"`
	BlockNumber string   `json:"blockNumber"`
	Data        string   `json:"data"`
	Topics      []string `json:"topics"`
}

type evmBlock struct {
	Timestamp string `json:"timestamp"`
}

func (s EvmRpcSource) Poll(ctx context.Context, cursor string) ([]FundingCandidate, string, error) {
	if s.RPCURL == "" {
		return nil, cursor, fmt.Errorf("base rpc url is required")
	}

	latestBlock, err := s.ethBlockNumber(ctx)
	if err != nil {
		return nil, cursor, err
	}

	current, err := strconv.ParseInt(cursor, 10, 64)
	if err != nil {
		current = 0
	}

	if latestBlock <= current {
		return nil, strconv.FormatInt(current, 10), nil
	}

	routes, err := s.RouteStore.ListActiveRoutes(ctx, s.Chain)
	if err != nil {
		return nil, cursor, err
	}

	fromBlock := current + 1
	toBlock := latestBlock
	candidates := make([]FundingCandidate, 0)
	blockTimestampCache := make(map[int64]time.Time)

	slog.Info("base-rpc: polling",
		"fromBlock", fromBlock,
		"toBlock", toBlock,
		"routeCount", len(routes),
		"factoryLevelScan", s.FactoryLevelScan,
	)

	// Build a set of known deposit addresses for dedup when factory-level scanning
	knownAddresses := make(map[string]bool)

	// —— Route-targeted scanning: query logs filtered by deposit address ——
	for _, route := range routes {
		contract, ok := s.TokenContracts[strings.ToUpper(route.Token)]
		if !ok || contract == "" {
			continue
		}

		knownAddresses[strings.ToLower(route.DepositAddress)] = true

		logs, err := s.ethGetLogs(ctx, contract, route.DepositAddress, fromBlock, toBlock)
		if err != nil {
			return nil, cursor, err
		}

		candidates = append(candidates, s.logsToFundingCandidates(ctx, logs, route.Token, route.DepositAddress, latestBlock, blockTimestampCache)...)
	}

	// —— Factory-level scanning: broad scan for QR/manual deposits ——
	// Scans all Transfer events to the token contract without filtering by "to".
	// Candidates whose "to" is NOT in knownAddresses are potential QR deposits
	// that the watcher would otherwise miss.
	if s.FactoryLevelScan {
		for tokenName, contract := range s.TokenContracts {
			if contract == "" {
				continue
			}

			logs, err := s.ethGetLogsBroad(ctx, contract, fromBlock, toBlock)
			if err != nil {
				slog.Warn("base-rpc: factory-level scan failed, continuing with route-targeted results",
					"token", tokenName,
					"error", err,
				)
				continue
			}

			for _, eventLog := range logs {
				if len(eventLog.Topics) < 3 {
					continue
				}

				toAddr := addressFromTopic(eventLog.Topics[2])
				if knownAddresses[toAddr] {
					// Already scanned via route-targeted mode
					continue
				}

				// This is a potential QR/manual deposit to an unknown address.
				// Create a candidate — ProcessCandidate will try to resolve it via the route resolver.
				candidates = append(candidates, s.logsToFundingCandidates(
					ctx,
					[]evmLog{eventLog},
					strings.ToUpper(tokenName),
					toAddr,
					latestBlock,
					blockTimestampCache,
				)...)
			}

			slog.Info("base-rpc: factory-level scan complete",
				"token", tokenName,
				"broadLogCount", len(logs),
			)
		}
	}

	slog.Info("base-rpc: poll complete",
		"candidateCount", len(candidates),
		"blockRange", fmt.Sprintf("%d-%d", fromBlock, toBlock),
	)

	return candidates, strconv.FormatInt(toBlock, 10), nil
}

// logsToFundingCandidates converts raw EVM logs to FundingCandidate structs.
func (s EvmRpcSource) logsToFundingCandidates(
	ctx context.Context,
	logs []evmLog,
	token string,
	depositAddress string,
	latestBlock int64,
	blockTimestampCache map[int64]time.Time,
) []FundingCandidate {
	candidates := make([]FundingCandidate, 0, len(logs))

	for _, eventLog := range logs {
		amountUSD, err := parseTokenAmountUSD(eventLog.Data)
		if err != nil {
			continue
		}

		blockNumber, err := parseHexInt64(eventLog.BlockNumber)
		if err != nil {
			continue
		}

		logIndexInt64, err := parseHexInt64(eventLog.LogIndex)
		if err != nil {
			continue
		}

		confirmedAt, ok := blockTimestampCache[blockNumber]
		if !ok {
			resolvedConfirmedAt, err := s.ethBlockTimestamp(ctx, eventLog.BlockNumber)
			if err != nil {
				continue
			}
			confirmedAt = resolvedConfirmedAt
			blockTimestampCache[blockNumber] = confirmedAt
		}

		confirmations := int(latestBlock-blockNumber) + 1

		finalizedThreshold := s.FinalizedConfirmations
		if finalizedThreshold <= 0 {
			finalizedThreshold = 12
		}
		finalized := confirmations >= finalizedThreshold

		var payerAddress string
		if len(eventLog.Topics) >= 2 && len(eventLog.Topics[1]) >= 26 {
			payerAddress = "0x" + eventLog.Topics[1][26:]
		}

		metadata := map[string]any{
			"blockNumber": blockNumber,
			"logIndex":    logIndexInt64,
		}
		if payerAddress != "" {
			metadata["payerAddress"] = payerAddress
		}

		candidates = append(candidates, FundingCandidate{
			Chain:          s.Chain,
			Token:          strings.ToUpper(token),
			TxHash:         eventLog.TxHash,
			LogIndex:       int(logIndexInt64),
			DepositAddress: depositAddress,
			AmountUSD:      amountUSD,
			ConfirmedAt:    confirmedAt,
			Confirmations:  confirmations,
			Finalized:      finalized,
			Metadata:       metadata,
		})
	}

	return candidates
}

func (s EvmRpcSource) ethBlockTimestamp(ctx context.Context, blockNumberHex string) (time.Time, error) {
	var block evmBlock
	if err := s.rpcCall(ctx, "eth_getBlockByNumber", []interface{}{blockNumberHex, false}, &block); err != nil {
		return time.Time{}, fmt.Errorf("eth_getBlockByNumber: %w", err)
	}

	timestampSeconds, err := parseHexInt64(block.Timestamp)
	if err != nil {
		return time.Time{}, err
	}
	if timestampSeconds <= 0 {
		return time.Time{}, fmt.Errorf("invalid block timestamp: %s", block.Timestamp)
	}

	return time.Unix(timestampSeconds, 0).UTC(), nil
}

func (s EvmRpcSource) ethBlockNumber(ctx context.Context) (int64, error) {
	var out string
	if err := s.rpcCall(ctx, "eth_blockNumber", []interface{}{}, &out); err != nil {
		return 0, fmt.Errorf("eth_blockNumber: %w", err)
	}
	return parseHexInt64(out)
}

func (s EvmRpcSource) ethGetLogs(ctx context.Context, contract string, depositAddress string, fromBlock int64, toBlock int64) ([]evmLog, error) {
	toTopic, err := encodeAddressTopic(depositAddress)
	if err != nil {
		return nil, err
	}

	params := map[string]interface{}{
		"fromBlock": fmt.Sprintf("0x%x", fromBlock),
		"toBlock":   fmt.Sprintf("0x%x", toBlock),
		"address":   contract,
		"topics":    []interface{}{transferTopic, nil, toTopic},
	}

	var logs []evmLog
	if err := s.rpcCall(ctx, "eth_getLogs", []interface{}{params}, &logs); err != nil {
		return nil, fmt.Errorf("eth_getLogs: %w", err)
	}

	return logs, nil
}

// ethGetLogsBroad queries Transfer events from a token contract without filtering by "to" address.
// Used by factory-level scanning to catch QR/manual deposits to CREATE2 addresses
// that are not yet registered as active routes.
func (s EvmRpcSource) ethGetLogsBroad(ctx context.Context, contract string, fromBlock int64, toBlock int64) ([]evmLog, error) {
	params := map[string]interface{}{
		"fromBlock": fmt.Sprintf("0x%x", fromBlock),
		"toBlock":   fmt.Sprintf("0x%x", toBlock),
		"address":   contract,
		"topics":    []interface{}{transferTopic},
	}

	var logs []evmLog
	if err := s.rpcCall(ctx, "eth_getLogs", []interface{}{params}, &logs); err != nil {
		return nil, fmt.Errorf("eth_getLogs (broad): %w", err)
	}

	return logs, nil
}

// addressFromTopic extracts a 0x-prefixed address from an ABI-encoded topic.
func addressFromTopic(topic string) string {
	if len(topic) < 42 {
		return topic
	}
	return "0x" + strings.ToLower(topic[len(topic)-40:])
}

func (s EvmRpcSource) rpcCall(ctx context.Context, method string, params interface{}, out interface{}) error {
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

func parseHexInt64(input string) (int64, error) {
	trimmed := strings.TrimPrefix(strings.TrimSpace(input), "0x")
	if trimmed == "" {
		return 0, nil
	}
	value, ok := new(big.Int).SetString(trimmed, 16)
	if !ok {
		return 0, fmt.Errorf("invalid hex integer: %s", input)
	}
	return value.Int64(), nil
}

func parseTokenAmountUSD(dataHex string) (float64, error) {
	trimmed := strings.TrimPrefix(strings.TrimSpace(dataHex), "0x")
	if trimmed == "" {
		return 0, nil
	}

	rawBytes, err := hex.DecodeString(trimmed)
	if err != nil {
		return 0, err
	}

	amount := new(big.Int).SetBytes(rawBytes)
	f := new(big.Float).SetInt(amount)
	usd := new(big.Float).Quo(f, big.NewFloat(1_000_000))
	result, _ := usd.Float64()
	return result, nil
}

func encodeAddressTopic(address string) (string, error) {
	trimmed := strings.TrimPrefix(strings.ToLower(strings.TrimSpace(address)), "0x")
	if len(trimmed) != 40 {
		return "", fmt.Errorf("invalid evm address length: %s", address)
	}
	if _, err := hex.DecodeString(trimmed); err != nil {
		return "", fmt.Errorf("invalid evm address format: %w", err)
	}

	return "0x" + strings.Repeat("0", 24) + trimmed, nil
}
