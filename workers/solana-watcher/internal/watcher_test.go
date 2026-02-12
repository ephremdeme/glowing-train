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

func TestWatcher_IgnoresWhenNotFinalized(t *testing.T) {
	pub := &publisherStub{}
	w := Watcher{Chain: "solana", Resolver: resolverStub{found: true, match: RouteMatch{TransferID: "tr_1"}}, Publisher: pub}

	result, err := w.ProcessCandidate(context.Background(), FundingCandidate{Chain: "solana", Token: "USDC", TxHash: "sig_1", Finalized: false})
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

func TestWatcher_PublishesWhenFinalizedAndRouteFound(t *testing.T) {
	pub := &publisherStub{}
	w := Watcher{Chain: "solana", Resolver: resolverStub{found: true, match: RouteMatch{TransferID: "tr_123"}}, Publisher: pub}

	result, err := w.ProcessCandidate(context.Background(), FundingCandidate{Chain: "solana", Token: "USDT", TxHash: "sig_abc", LogIndex: 2, DepositAddress: "dep_1", AmountUSD: 80, Finalized: true})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result != ProcessConfirmed {
		t.Fatalf("expected confirmed, got %s", result)
	}
	if len(pub.calledWith) != 1 {
		t.Fatalf("expected one event published")
	}
}

func TestWatcher_ReturnsRouteNotFound(t *testing.T) {
	pub := &publisherStub{}
	w := Watcher{Chain: "solana", Resolver: resolverStub{found: false}, Publisher: pub}

	result, err := w.ProcessCandidate(context.Background(), FundingCandidate{Chain: "solana", Token: "USDC", TxHash: "sig_none", Finalized: true})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result != ProcessRouteNotFound {
		t.Fatalf("expected route_not_found, got %s", result)
	}
}

func TestWatcher_PropagatesPublisherError(t *testing.T) {
	pub := &publisherStub{err: errors.New("publish failed")}
	w := Watcher{Chain: "solana", Resolver: resolverStub{found: true, match: RouteMatch{TransferID: "tr_1"}}, Publisher: pub}

	_, err := w.ProcessCandidate(context.Background(), FundingCandidate{Chain: "solana", Token: "USDC", TxHash: "sig_fail", Finalized: true})
	if err == nil {
		t.Fatalf("expected error")
	}
}
