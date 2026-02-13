package internal

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"time"
)

type CandidateSource interface {
	Poll(ctx context.Context, cursor string) ([]FundingCandidate, string, error)
}

type CheckpointStore interface {
	GetCursor(ctx context.Context) (string, error)
	SaveCursor(ctx context.Context, cursor string) error
}

type DedupeStore interface {
	Seen(ctx context.Context, key string) (bool, error)
	Mark(ctx context.Context, key string) error
}

type Runner struct {
	Name            string
	PollInterval    time.Duration
	Source          CandidateSource
	Watcher         Watcher
	CheckpointStore CheckpointStore
	DedupeStore     DedupeStore
	Logger          *log.Logger
}

func (r Runner) Run(ctx context.Context) error {
	if r.Source == nil || r.CheckpointStore == nil || r.DedupeStore == nil {
		return fmt.Errorf("runner dependencies not configured")
	}
	if r.Logger == nil {
		r.Logger = log.Default()
	}
	if r.PollInterval <= 0 {
		r.PollInterval = 5 * time.Second
	}

	cursor, err := r.CheckpointStore.GetCursor(ctx)
	if err != nil {
		return fmt.Errorf("load cursor: %w", err)
	}

	r.Logger.Printf("%s: starting watcher loop from cursor=%s", r.Name, cursor)

	if err := r.runOnce(ctx, cursor); err != nil {
		r.Logger.Printf("%s: initial poll failed: %v", r.Name, err)
	}

	ticker := time.NewTicker(r.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			if err := r.runOnce(ctx, cursor); err != nil {
				r.Logger.Printf("%s: poll failed: %v", r.Name, err)
				continue
			}

			nextCursor, err := r.CheckpointStore.GetCursor(ctx)
			if err == nil {
				cursor = nextCursor
			}
		}
	}
}

func (r Runner) runOnce(ctx context.Context, currentCursor string) error {
	candidates, nextCursor, err := r.Source.Poll(ctx, currentCursor)
	if err != nil {
		return fmt.Errorf("poll source: %w", err)
	}

	for _, candidate := range candidates {
		eventKey := buildEventKey(candidate)

		seen, err := r.DedupeStore.Seen(ctx, eventKey)
		if err != nil {
			return fmt.Errorf("check dedupe: %w", err)
		}
		if seen {
			continue
		}

		result, err := r.Watcher.ProcessCandidate(ctx, candidate)
		if err != nil {
			return fmt.Errorf("process candidate %s: %w", eventKey, err)
		}

		if result == ProcessConfirmed {
			if err := r.DedupeStore.Mark(ctx, eventKey); err != nil {
				return fmt.Errorf("mark dedupe: %w", err)
			}
		}
	}

	if err := r.CheckpointStore.SaveCursor(ctx, nextCursor); err != nil {
		return fmt.Errorf("save checkpoint: %w", err)
	}

	return nil
}

func buildEventKey(candidate FundingCandidate) string {
	return candidate.Chain + ":" + candidate.TxHash + ":" + strconv.Itoa(candidate.LogIndex)
}
