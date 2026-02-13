package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/cryptopay/base-watcher/internal"
)

func envOrDefault(name string, fallback string) string {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}
	return value
}

func envIntOrDefault(name string, fallback int) int {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	coreAPIURL := envOrDefault("CORE_API_URL", "http://localhost:3001")
	rpcURL := os.Getenv("BASE_RPC_URL")
	callbackURL := envOrDefault("CORE_API_FUNDING_CALLBACK_URL", "http://localhost:3001/internal/v1/funding-confirmed")
	callbackSecret := envOrDefault("WATCHER_CALLBACK_SECRET", "dev-callback-secret-change-me")

	client := internal.CoreAPIClient{
		BaseURL:   coreAPIURL,
		Secret:    envOrDefault("AUTH_JWT_SECRET", "dev-jwt-secret-change-me"),
		Issuer:    envOrDefault("AUTH_JWT_ISSUER", "cryptopay-internal"),
		Audience:  envOrDefault("AUTH_JWT_AUDIENCE", "cryptopay-services"),
		Subject:   "base-watcher",
		HTTPClient: &http.Client{Timeout: 8 * time.Second},
	}

	routeResolver := internal.CoreAPIRouteResolver{Client: &client, WatcherName: "base-watcher"}
	routeStore := internal.CoreAPIRouteStore{Client: &client}
	checkpointStore := internal.CoreAPICheckpointStore{Client: &client, WatcherName: "base-watcher", Chain: "base"}
	dedupeStore := internal.CoreAPIDedupeStore{Client: &client, WatcherName: "base-watcher"}

	source := internal.EvmRpcSource{
		RPCURL:     rpcURL,
		HTTPClient: &http.Client{Timeout: 10 * time.Second},
		RouteStore: routeStore,
		Chain:      "base",
		TokenContracts: map[string]string{
			"USDC": os.Getenv("BASE_USDC_CONTRACT"),
			"USDT": os.Getenv("BASE_USDT_CONTRACT"),
		},
	}

	watcher := internal.Watcher{
		Chain:            "base",
		MinConfirmations: envIntOrDefault("BASE_MIN_CONFIRMATIONS", 2),
		Resolver:         routeResolver,
		Publisher: internal.CallbackPublisher{
			Endpoint: callbackURL,
			Secret:   callbackSecret,
			Client:   &http.Client{Timeout: 8 * time.Second},
			Now:      time.Now,
		},
	}

	runner := internal.Runner{
		Name:            "base-watcher",
		PollInterval:    time.Duration(envIntOrDefault("BASE_POLL_INTERVAL_MS", 5000)) * time.Millisecond,
		Source:          source,
		Watcher:         watcher,
		CheckpointStore: checkpointStore,
		DedupeStore:     dedupeStore,
		Logger:          log.Default(),
	}

	if err := runner.Run(ctx); err != nil {
		log.Fatalf("base-watcher stopped with error: %v", err)
	}
}
