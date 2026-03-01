package internal

import (
	"context"
	"errors"
	"testing"
)

type resolverStub struct {
	match RouteMatch
	found bool
	err   error
}

func (r resolverStub) FindTransferByRoute(_ context.Context, _ string, _ string, _ string) (RouteMatch, bool, error) {
	return r.match, r.found, r.err
}

type publisherStub struct {
	err        error
	calledWith []FundingConfirmedEvent
}

func (p *publisherStub) PublishFundingConfirmed(_ context.Context, event FundingConfirmedEvent) error {
	p.calledWith = append(p.calledWith, event)
	return p.err
}

func TestWatcher_IgnoresBeforeMinConfirmations(t *testing.T) {
	pub := &publisherStub{}
	w := Watcher{Chain: "base", MinConfirmations: 2, Resolver: resolverStub{found: true, match: RouteMatch{TransferID: "tr_1"}}, Publisher: pub}

	result, err := w.ProcessCandidate(context.Background(), FundingCandidate{Chain: "base", Token: "USDC", TxHash: "0x1", Confirmations: 1})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result != ProcessIgnored {
		t.Fatalf("expected ignored, got %s", result)
	}
	if len(pub.calledWith) != 0 {
		t.Fatalf("publisher should not be called")
	}
}

func TestWatcher_PublishesWhenRouteFoundAndConfirmed(t *testing.T) {
	pub := &publisherStub{}
	w := Watcher{Chain: "base", MinConfirmations: 2, Resolver: resolverStub{found: true, match: RouteMatch{TransferID: "tr_123"}}, Publisher: pub}

	result, err := w.ProcessCandidate(context.Background(), FundingCandidate{
		Chain: "base", Token: "USDC", TxHash: "0xabc", LogIndex: 3,
		DepositAddress: "dep_1", AmountUSD: 100, Confirmations: 2,
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result != ProcessConfirmed {
		t.Fatalf("expected confirmed, got %s", result)
	}
	if len(pub.calledWith) != 1 {
		t.Fatalf("expected one published event")
	}
	ev := pub.calledWith[0]
	if ev.EventID == "" {
		t.Fatalf("event id should be set")
	}
	if ev.TransferID != "tr_123" {
		t.Fatalf("expected transfer id tr_123, got %s", ev.TransferID)
	}
	if ev.DepositAddress != "dep_1" {
		t.Fatalf("expected deposit address dep_1, got %s", ev.DepositAddress)
	}
}

func TestWatcher_ReturnsRouteNotFound(t *testing.T) {
	pub := &publisherStub{}
	w := Watcher{Chain: "base", MinConfirmations: 1, Resolver: resolverStub{found: false}, Publisher: pub}

	result, err := w.ProcessCandidate(context.Background(), FundingCandidate{Chain: "base", Token: "USDT", TxHash: "0x2", Confirmations: 5})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result != ProcessRouteNotFound {
		t.Fatalf("expected route_not_found, got %s", result)
	}
}

func TestWatcher_PropagatesPublisherError(t *testing.T) {
	pub := &publisherStub{err: errors.New("publish failed")}
	w := Watcher{Chain: "base", MinConfirmations: 1, Resolver: resolverStub{found: true, match: RouteMatch{TransferID: "tr_1"}}, Publisher: pub}

	_, err := w.ProcessCandidate(context.Background(), FundingCandidate{Chain: "base", Token: "USDC", TxHash: "0x3", Confirmations: 5})
	if err == nil {
		t.Fatalf("expected error")
	}
}

func TestWatcher_FinalizedBypassesMinConfirmations(t *testing.T) {
	pub := &publisherStub{}
	w := Watcher{Chain: "base", MinConfirmations: 100, Resolver: resolverStub{found: true, match: RouteMatch{TransferID: "tr_fin"}}, Publisher: pub}

	// Only 1 confirmation but Finalized=true should bypass MinConfirmations check
	result, err := w.ProcessCandidate(context.Background(), FundingCandidate{
		Chain: "base", Token: "USDC", TxHash: "0xfin", Confirmations: 1,
		Finalized: true, DepositAddress: "dep_fin",
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result != ProcessConfirmed {
		t.Fatalf("expected confirmed (Finalized bypasses MinConfirmations), got %s", result)
	}
}

func TestWatcher_MetadataPassedThrough(t *testing.T) {
	pub := &publisherStub{}
	w := Watcher{Chain: "base", MinConfirmations: 1, Resolver: resolverStub{found: true, match: RouteMatch{TransferID: "tr_meta"}}, Publisher: pub}

	meta := map[string]any{"payerAddress": "0xabc123", "blockNumber": int64(42)}
	result, err := w.ProcessCandidate(context.Background(), FundingCandidate{
		Chain: "base", Token: "USDC", TxHash: "0xmeta",
		DepositAddress: "dep_meta", Confirmations: 5, Metadata: meta,
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result != ProcessConfirmed {
		t.Fatalf("expected confirmed, got %s", result)
	}
	ev := pub.calledWith[0]
	if ev.Metadata == nil {
		t.Fatalf("expected metadata to be set")
	}
	if ev.Metadata["payerAddress"] != "0xabc123" {
		t.Fatalf("expected payerAddress in metadata, got %v", ev.Metadata["payerAddress"])
	}
}

func TestWatcher_PrePopulatedTransferIDSkipsResolver(t *testing.T) {
	// Use a resolver that would fail if called
	resolver := resolverStub{found: false, err: errors.New("resolver should not be called")}
	pub := &publisherStub{}
	w := Watcher{Chain: "base", MinConfirmations: 1, Resolver: resolver, Publisher: pub}

	// Candidate already has TransferID set — should skip resolver
	result, err := w.ProcessCandidate(context.Background(), FundingCandidate{
		Chain: "base", Token: "USDC", TxHash: "0xpre", TransferID: "tr_pre",
		DepositAddress: "dep_pre", Confirmations: 5,
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result != ProcessConfirmed {
		t.Fatalf("expected confirmed, got %s", result)
	}
	if pub.calledWith[0].TransferID != "tr_pre" {
		t.Fatalf("expected pre-populated transfer id")
	}
}
