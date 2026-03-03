package internal

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

type callbackPayload struct {
	EventID        string         `json:"eventId"`
	Chain          string         `json:"chain"`
	Token          string         `json:"token"`
	TxHash         string         `json:"txHash"`
	LogIndex       int            `json:"logIndex"`
	TransferID     string         `json:"transferId,omitempty"`
	DepositAddress string         `json:"depositAddress"`
	AmountUSD      float64        `json:"amountUsd"`
	ConfirmedAt    string         `json:"confirmedAt"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

type CallbackPublisher struct {
	Endpoint  string
	Secret    string
	APIClient *CoreAPIClient
	Client    *http.Client
	Now       func() time.Time
}

func (p CallbackPublisher) PublishFundingConfirmed(ctx context.Context, event FundingConfirmedEvent) error {
	if p.Endpoint == "" {
		return fmt.Errorf("callback endpoint is required")
	}
	if p.Secret == "" {
		return fmt.Errorf("callback secret is required")
	}

	client := p.Client
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}

	now := p.Now
	if now == nil {
		now = time.Now
	}

	if event.ConfirmedAt.IsZero() {
		return fmt.Errorf("confirmedAt is required")
	}

	payload := callbackPayload{
		EventID:        event.EventID,
		Chain:          event.Chain,
		Token:          event.Token,
		TxHash:         event.TxHash,
		LogIndex:       event.LogIndex,
		TransferID:     event.TransferID,
		DepositAddress: event.DepositAddress,
		AmountUSD:      event.AmountUSD,
		ConfirmedAt:    event.ConfirmedAt.UTC().Format(time.RFC3339Nano),
		Metadata:       event.Metadata,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	timestampMs := strconv.FormatInt(now().UnixMilli(), 10)
	sig := signPayload(timestampMs, body, p.Secret)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.Endpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}

	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-callback-timestamp", timestampMs)
	req.Header.Set("x-callback-signature", sig)
	req.Header.Set("idempotency-key", event.EventID)

	if p.APIClient != nil {
		if token, err := p.APIClient.CreateToken(); err == nil {
			req.Header.Set("authorization", "Bearer "+token)
		}
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("send callback: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("callback rejected with status %d", resp.StatusCode)
	}

	return nil
}

func signPayload(timestampMs string, payload []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestampMs))
	mac.Write([]byte("."))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}
