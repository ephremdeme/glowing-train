package internal

import (
	"context"
	"errors"
)

type FundingCandidate struct {
	Chain          string
	Token          string
	TxHash         string
	LogIndex       int
	DepositAddress string
	AmountUSD      float64
	Finalized      bool
}

type RouteMatch struct {
	TransferID string
}

type RouteResolver interface {
	FindTransferByRoute(ctx context.Context, chain string, token string, depositAddress string) (RouteMatch, bool, error)
}

type EventPublisher interface {
	PublishFundingConfirmed(ctx context.Context, event FundingConfirmedEvent) error
}

type FundingConfirmedEvent struct {
	EventID        string
	Chain          string
	Token          string
	TxHash         string
	LogIndex       int
	DepositAddress string
	AmountUSD      float64
}

type ProcessResult string

const (
	ProcessIgnored       ProcessResult = "ignored"
	ProcessConfirmed     ProcessResult = "confirmed"
	ProcessRouteNotFound ProcessResult = "route_not_found"
)

var ErrInvalidChain = errors.New("invalid chain for watcher")

type Watcher struct {
	Chain     string
	Resolver  RouteResolver
	Publisher EventPublisher
}

func (w Watcher) ProcessCandidate(ctx context.Context, c FundingCandidate) (ProcessResult, error) {
	if c.Chain != w.Chain {
		return ProcessIgnored, ErrInvalidChain
	}

	if !c.Finalized {
		return ProcessIgnored, nil
	}

	match, found, err := w.Resolver.FindTransferByRoute(ctx, c.Chain, c.Token, c.DepositAddress)
	if err != nil {
		return ProcessIgnored, err
	}

	if !found {
		return ProcessRouteNotFound, nil
	}

	event := FundingConfirmedEvent{
		EventID:        match.TransferID + ":" + c.TxHash,
		Chain:          c.Chain,
		Token:          c.Token,
		TxHash:         c.TxHash,
		LogIndex:       c.LogIndex,
		DepositAddress: c.DepositAddress,
		AmountUSD:      c.AmountUSD,
	}

	if err := w.Publisher.PublishFundingConfirmed(ctx, event); err != nil {
		return ProcessIgnored, err
	}

	return ProcessConfirmed, nil
}
