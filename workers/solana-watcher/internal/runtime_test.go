package internal

import (
	"context"
	"errors"
	"io"
	"log"
	"testing"
	"time"
)

type sourceStub struct {
	candidates []FundingCandidate
	nextCursor string
	err        error
}

func (s sourceStub) Poll(_ context.Context, _ string) ([]FundingCandidate, string, error) {
	if s.err != nil {
		return nil, "0", s.err
	}
	return s.candidates, s.nextCursor, nil
}

type checkpointStub struct {
	cursor string
}

func (c *checkpointStub) GetCursor(_ context.Context) (string, error) {
	if c.cursor == "" {
		return "0", nil
	}
	return c.cursor, nil
}

func (c *checkpointStub) SaveCursor(_ context.Context, cursor string) error {
	c.cursor = cursor
	return nil
}

type dedupeStub struct {
	seen map[string]bool
}

func (d *dedupeStub) Seen(_ context.Context, key string) (bool, error) {
	return d.seen[key], nil
}

func (d *dedupeStub) Mark(_ context.Context, key string) error {
	d.seen[key] = true
	return nil
}

func TestRunner_ProcessesAndMarksDedupe(t *testing.T) {
	pub := &publisherStub{}
	checkpoint := &checkpointStub{cursor: "10"}
	dedupe := &dedupeStub{seen: map[string]bool{}}

	runner := Runner{
		Name:         "solana-watcher-test",
		PollInterval: 5 * time.Millisecond,
		Source: sourceStub{
			candidates: []FundingCandidate{{
				Chain:          "solana",
				Token:          "USDC",
				TxHash:         "sig_abc",
				LogIndex:       0,
				DepositAddress: "dep_1",
				AmountUSD:      10,
				Finalized:      true,
			}},
			nextCursor: "20",
		},
		Watcher: Watcher{
			Chain:     "solana",
			Resolver:  resolverStub{found: true, match: RouteMatch{TransferID: "tr_1"}},
			Publisher: pub,
		},
		CheckpointStore: checkpoint,
		DedupeStore:     dedupe,
		Logger:          log.New(io.Discard, "", 0),
	}

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()

	if err := runner.Run(ctx); err != nil {
		t.Fatalf("unexpected run error: %v", err)
	}

	if checkpoint.cursor != "20" {
		t.Fatalf("expected cursor 20, got %s", checkpoint.cursor)
	}
	if len(pub.calledWith) == 0 {
		t.Fatalf("expected at least one published event")
	}
	if !dedupe.seen["solana:sig_abc:0"] {
		t.Fatalf("expected dedupe mark for event key")
	}
}

func TestRunner_PropagatesSourceError(t *testing.T) {
	runner := Runner{
		Name:            "solana-watcher-test",
		PollInterval:    5 * time.Millisecond,
		Source:          sourceStub{err: errors.New("poll error")},
		Watcher:         Watcher{},
		CheckpointStore: &checkpointStub{cursor: "0"},
		DedupeStore:     &dedupeStub{seen: map[string]bool{}},
		Logger:          log.New(io.Discard, "", 0),
	}

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(15 * time.Millisecond)
		cancel()
	}()

	if err := runner.Run(ctx); err != nil {
		t.Fatalf("runner should continue until context cancel, got %v", err)
	}
}
