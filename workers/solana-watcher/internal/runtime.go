package internal

import (
	"context"
	"fmt"
	"log/slog"
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
	Logger          *slog.Logger
}

func (r Runner) Run(ctx context.Context) error {
	if r.Source == nil || r.CheckpointStore == nil || r.DedupeStore == nil {
		return fmt.Errorf("runner dependencies not configured")
	}
	if r.Logger == nil {
		r.Logger = slog.Default()
	}
	if r.PollInterval <= 0 {
		r.PollInterval = 5 * time.Second
	}

	cursor, err := r.CheckpointStore.GetCursor(ctx)
	if err != nil {
		return fmt.Errorf("load cursor: %w", err)
	}

	r.Logger.Info("starting watcher loop",
		"watcher", r.Name,
		"cursor", cursor,
		"pollInterval", r.PollInterval.String(),
	)

	if err := r.runOnce(ctx, cursor); err != nil {
		r.Logger.Error("initial poll failed",
			"watcher", r.Name,
			"error", err,
		)
	}

	ticker := time.NewTicker(r.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			r.Logger.Info("watcher shutting down", "watcher", r.Name)
			return nil
		case <-ticker.C:
			if err := r.runOnce(ctx, cursor); err != nil {
				r.Logger.Error("poll failed",
					"watcher", r.Name,
					"cursor", cursor,
					"error", err,
				)
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

	r.Logger.Info("poll complete",
		"watcher", r.Name,
		"cursor", currentCursor,
		"nextCursor", nextCursor,
		"candidateCount", len(candidates),
	)

	confirmedCount := 0
	skippedCount := 0

	for _, candidate := range candidates {
		eventKey := buildEventKey(candidate)

		seen, err := r.DedupeStore.Seen(ctx, eventKey)
		if err != nil {
			return fmt.Errorf("check dedupe: %w", err)
		}
		if seen {
			skippedCount++
			r.Logger.Debug("candidate already seen, skipping",
				"eventKey", eventKey,
				"txHash", candidate.TxHash,
			)
			continue
		}

		result, err := r.Watcher.ProcessCandidate(ctx, candidate)
		if err != nil {
			r.Logger.Error("process candidate failed",
				"watcher", r.Name,
				"eventKey", eventKey,
				"txHash", candidate.TxHash,
				"depositAddress", candidate.DepositAddress,
				"error", err,
			)
			return fmt.Errorf("process candidate %s: %w", eventKey, err)
		}

		r.Logger.Info("candidate processed",
			"watcher", r.Name,
			"eventKey", eventKey,
			"txHash", candidate.TxHash,
			"depositAddress", candidate.DepositAddress,
			"amountUSD", candidate.AmountUSD,
			"result", string(result),
		)

		if result == ProcessConfirmed {
			confirmedCount++
			if err := r.DedupeStore.Mark(ctx, eventKey); err != nil {
				return fmt.Errorf("mark dedupe: %w", err)
			}
		}
	}

	if len(candidates) > 0 {
		r.Logger.Info("poll cycle summary",
			"watcher", r.Name,
			"total", len(candidates),
			"confirmed", confirmedCount,
			"skipped", skippedCount,
			"unresolved", len(candidates)-confirmedCount-skippedCount,
		)
	}

	if err := r.CheckpointStore.SaveCursor(ctx, nextCursor); err != nil {
		return fmt.Errorf("save checkpoint: %w", err)
	}

	return nil
}

func buildEventKey(candidate FundingCandidate) string {
	return candidate.Chain + ":" + candidate.TxHash + ":" + strconv.Itoa(candidate.LogIndex)
}
