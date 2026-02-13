package internal

import (
	"context"
	"fmt"
)

type ActiveRoute struct {
	Token          string `json:"token"`
	DepositAddress string `json:"depositAddress"`
}

type RouteStore interface {
	ListActiveRoutes(ctx context.Context, chain string) ([]ActiveRoute, error)
}

type CoreAPIRouteResolver struct {
	Client      *CoreAPIClient
	WatcherName string
}

func (r CoreAPIRouteResolver) FindTransferByRoute(ctx context.Context, chain string, token string, depositAddress string) (RouteMatch, bool, error) {
	if r.Client == nil {
		return RouteMatch{}, false, fmt.Errorf("core api client is required")
	}

	var out struct {
		Found      bool   `json:"found"`
		TransferID string `json:"transferId"`
	}
	err := r.Client.Do(ctx, "POST", "/internal/v1/watchers/resolve-route", map[string]any{
		"watcherName":    r.WatcherName,
		"chain":          chain,
		"token":          token,
		"depositAddress": depositAddress,
	}, &out)
	if err != nil {
		return RouteMatch{}, false, err
	}

	if !out.Found {
		return RouteMatch{}, false, nil
	}

	return RouteMatch{TransferID: out.TransferID}, true, nil
}

type CoreAPIRouteStore struct {
	Client *CoreAPIClient
}

func (s CoreAPIRouteStore) ListActiveRoutes(ctx context.Context, chain string) ([]ActiveRoute, error) {
	if s.Client == nil {
		return nil, fmt.Errorf("core api client is required")
	}

	var out struct {
		Items []ActiveRoute `json:"items"`
	}
	err := s.Client.Do(ctx, "GET", "/internal/v1/watchers/routes?chain="+chain, nil, &out)
	if err != nil {
		return nil, err
	}

	return out.Items, nil
}

type CoreAPICheckpointStore struct {
	Client      *CoreAPIClient
	WatcherName string
	Chain       string
}

func (s CoreAPICheckpointStore) GetCursor(ctx context.Context) (string, error) {
	if s.Client == nil {
		return "", fmt.Errorf("core api client is required")
	}

	var out struct {
		Cursor string `json:"cursor"`
	}
	err := s.Client.Do(ctx, "GET", "/internal/v1/watchers/checkpoint/"+s.WatcherName+"?chain="+s.Chain, nil, &out)
	if err != nil {
		return "", err
	}
	if out.Cursor == "" {
		return "0", nil
	}
	return out.Cursor, nil
}

func (s CoreAPICheckpointStore) SaveCursor(ctx context.Context, cursor string) error {
	if s.Client == nil {
		return fmt.Errorf("core api client is required")
	}

	return s.Client.Do(ctx, "POST", "/internal/v1/watchers/checkpoint/"+s.WatcherName, map[string]any{
		"chain":  s.Chain,
		"cursor": cursor,
	}, nil)
}

type CoreAPIDedupeStore struct {
	Client      *CoreAPIClient
	WatcherName string
}

func (s CoreAPIDedupeStore) Seen(ctx context.Context, key string) (bool, error) {
	if s.Client == nil {
		return false, fmt.Errorf("core api client is required")
	}

	var out struct {
		Seen bool `json:"seen"`
	}
	err := s.Client.Do(ctx, "POST", "/internal/v1/watchers/dedupe/check/"+s.WatcherName, map[string]any{"eventKey": key}, &out)
	if err != nil {
		return false, err
	}

	return out.Seen, nil
}

func (s CoreAPIDedupeStore) Mark(ctx context.Context, key string) error {
	if s.Client == nil {
		return fmt.Errorf("core api client is required")
	}

	return s.Client.Do(ctx, "POST", "/internal/v1/watchers/dedupe/mark/"+s.WatcherName, map[string]any{"eventKey": key}, nil)
}
