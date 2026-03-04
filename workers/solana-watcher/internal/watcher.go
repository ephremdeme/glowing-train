package internal

import (
	"context"
	"errors"
	"strconv"
	"time"
)

type FundingCandidate struct {
	Chain          string
	Token          string
	TxHash         string
	LogIndex       int
	TransferID     string
	ReferenceHash  string
	DepositAddress string
	AmountUSD      float64
	ConfirmedAt    time.Time
	Metadata       map[string]any
	Finalized      bool
}

type RouteMatch struct {
	TransferID     string
	DepositAddress string
}

type RouteResolver interface {
	FindTransferByRoute(ctx context.Context, chain string, token string, depositAddress string) (RouteMatch, bool, error)
	FindTransferBySolanaPayment(ctx context.Context, token string, referenceHash string) (RouteMatch, bool, error)
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
	TransferID     string
	DepositAddress string
	AmountUSD      float64
	ConfirmedAt    time.Time
	Metadata       map[string]any
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
	result, _, _, err := w.ProcessCandidateWithMatch(ctx, c)
	return result, err
}

func (w Watcher) ProcessCandidateWithMatch(ctx context.Context, c FundingCandidate) (ProcessResult, string, string, error) {
	if c.Chain != w.Chain {
		return ProcessIgnored, "", "", ErrInvalidChain
	}

	if !c.Finalized {
		return ProcessIgnored, "", "", nil
	}
	if c.ConfirmedAt.IsZero() {
		return ProcessIgnored, "", "", nil
	}

	match := RouteMatch{TransferID: c.TransferID, DepositAddress: c.DepositAddress}
	found := match.TransferID != ""

	if !found {
		var err error
		if c.Chain == "solana" && c.ReferenceHash != "" {
			match, found, err = w.Resolver.FindTransferBySolanaPayment(ctx, c.Token, c.ReferenceHash)
		} else {
			match, found, err = w.Resolver.FindTransferByRoute(ctx, c.Chain, c.Token, c.DepositAddress)
		}
		if err != nil {
			return ProcessIgnored, "", "", err
		}
	}

	if !found {
		return ProcessRouteNotFound, "", c.DepositAddress, nil
	}

	depositAddress := c.DepositAddress
	if depositAddress == "" {
		depositAddress = match.DepositAddress
	}
	eventID := match.TransferID + ":" + c.TxHash
	if c.LogIndex > 0 {
		eventID = eventID + ":" + strconv.Itoa(c.LogIndex)
	}

	event := FundingConfirmedEvent{
		EventID:        eventID,
		Chain:          c.Chain,
		Token:          c.Token,
		TxHash:         c.TxHash,
		LogIndex:       c.LogIndex,
		TransferID:     match.TransferID,
		DepositAddress: depositAddress,
		AmountUSD:      c.AmountUSD,
		ConfirmedAt:    c.ConfirmedAt,
		Metadata:       c.Metadata,
	}

	if err := w.Publisher.PublishFundingConfirmed(ctx, event); err != nil {
		return ProcessIgnored, "", "", err
	}

	return ProcessConfirmed, match.TransferID, depositAddress, nil
}
