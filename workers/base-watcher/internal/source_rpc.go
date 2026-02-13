package internal

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

type EvmRpcSource struct {
	RPCURL         string
	HTTPClient     *http.Client
	RouteStore     RouteStore
	TokenContracts map[string]string
	Chain          string
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

	for _, route := range routes {
		contract, ok := s.TokenContracts[strings.ToUpper(route.Token)]
		if !ok || contract == "" {
			continue
		}

		logs, err := s.ethGetLogs(ctx, contract, route.DepositAddress, fromBlock, toBlock)
		if err != nil {
			return nil, cursor, err
		}

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

			confirmations := int(latestBlock-blockNumber) + 1
			candidates = append(candidates, FundingCandidate{
				Chain:          s.Chain,
				Token:          strings.ToUpper(route.Token),
				TxHash:         eventLog.TxHash,
				LogIndex:       int(logIndexInt64),
				DepositAddress: route.DepositAddress,
				AmountUSD:      amountUSD,
				Confirmations:  confirmations,
			})
		}
	}

	return candidates, strconv.FormatInt(toBlock, 10), nil
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
