package internal

import (
	"context"
	"io"
	"net/http"
	"testing"
	"time"
)

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestCallbackPublisherPublishesSignedPayload(t *testing.T) {
	var gotSignature string
	var gotTimestamp string
	var gotIdempotencyKey string
	var gotBody []byte

	now := time.Date(2026, 2, 13, 12, 0, 0, 0, time.UTC)
	secret := "test-secret"

	client := &http.Client{
		Transport: roundTripperFunc(func(r *http.Request) (*http.Response, error) {
			gotSignature = r.Header.Get("x-callback-signature")
			gotTimestamp = r.Header.Get("x-callback-timestamp")
			gotIdempotencyKey = r.Header.Get("idempotency-key")
			body, err := io.ReadAll(r.Body)
			if err != nil {
				return nil, err
			}
			gotBody = body
			return &http.Response{
				StatusCode: http.StatusAccepted,
				Body:       http.NoBody,
				Header:     make(http.Header),
			}, nil
		}),
	}

	pub := CallbackPublisher{
		Endpoint: "https://core-api.internal/internal/v1/funding-confirmed",
		Secret:   secret,
		Client:   client,
		Now:      func() time.Time { return now },
	}

	event := FundingConfirmedEvent{
		EventID:        "evt_123",
		Chain:          "base",
		Token:          "USDC",
		TxHash:         "0xabc",
		LogIndex:       1,
		DepositAddress: "0xdep",
		AmountUSD:      100,
	}

	if err := pub.PublishFundingConfirmed(context.Background(), event); err != nil {
		t.Fatalf("unexpected publish error: %v", err)
	}

	if gotTimestamp != "1770984000000" {
		t.Fatalf("unexpected timestamp header: %s", gotTimestamp)
	}
	if gotSignature == "" {
		t.Fatalf("expected non-empty signature")
	}
	expectedSignature := signPayload(gotTimestamp, gotBody, secret)
	if gotSignature != expectedSignature {
		t.Fatalf("unexpected signature: %s", gotSignature)
	}
	if gotIdempotencyKey != event.EventID {
		t.Fatalf("unexpected idempotency key: %s", gotIdempotencyKey)
	}
}

func TestCallbackPublisherFailsOnNonSuccess(t *testing.T) {
	client := &http.Client{
		Transport: roundTripperFunc(func(r *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusUnauthorized,
				Body:       http.NoBody,
				Header:     make(http.Header),
			}, nil
		}),
	}

	pub := CallbackPublisher{
		Endpoint: "https://core-api.internal/internal/v1/funding-confirmed",
		Secret:   "test-secret",
		Client:   client,
		Now:      time.Now,
	}

	err := pub.PublishFundingConfirmed(context.Background(), FundingConfirmedEvent{EventID: "evt_1"})
	if err == nil {
		t.Fatalf("expected error for non-2xx response")
	}
}
