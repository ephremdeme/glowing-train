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

	"github.com/cryptopay/solana-watcher/internal"
)

const (
	// Keep defaults aligned with apps/web/config/devnet.json.
	defaultDevnetUSDCMint = "6bDUveKHvCojQNt5VzsvLpScyQyDwScFVzw7mGTRP3Km"
	defaultDevnetUSDTMint = "2Seg9ZgkCyyqdEgTkNcxG2kszh9S2GrAzcY6XjPhtGJn"
)

func envOrDefault(name string, fallback string) string {
	value := os.Getenv(name)
	if value == "" {
		return fallback
	}
	return value
}

func envFirstOrDefault(names []string, fallback string) string {
	for _, name := range names {
		value := os.Getenv(name)
		if value != "" {
			return value
		}
	}
	return fallback
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
	rpcURL := os.Getenv("SOLANA_RPC_URL")
	callbackURL := envOrDefault("CORE_API_FUNDING_CALLBACK_URL", "http://localhost:3001/internal/v1/funding-confirmed")
	callbackSecret := envOrDefault("WATCHER_CALLBACK_SECRET", "dev-callback-secret-change-me")

	client := internal.CoreAPIClient{
		BaseURL:    coreAPIURL,
		Secret:     envOrDefault("AUTH_JWT_SECRET", "dev-jwt-secret-change-me"),
		Issuer:     envOrDefault("AUTH_JWT_ISSUER", "cryptopay-internal"),
		Audience:   envOrDefault("AUTH_JWT_AUDIENCE", "cryptopay-services"),
		Subject:    "solana-watcher",
		HTTPClient: &http.Client{Timeout: 8 * time.Second},
	}

	routeResolver := internal.CoreAPIRouteResolver{Client: &client, WatcherName: "solana-watcher"}
	routeStore := internal.CoreAPIRouteStore{Client: &client}
	checkpointStore := internal.CoreAPICheckpointStore{Client: &client, WatcherName: "solana-watcher", Chain: "solana"}
	dedupeStore := internal.CoreAPIDedupeStore{Client: &client, WatcherName: "solana-watcher"}

	source := internal.SolanaRpcSource{
		RPCURL:     rpcURL,
		HTTPClient: &http.Client{Timeout: 10 * time.Second},
		RouteStore: routeStore,
		Chain:      "solana",
		Limit:      envIntOrDefault("SOLANA_SIGNATURE_LIMIT", 100),
		TokenMints: map[string]string{
			"USDC": envFirstOrDefault([]string{"SOLANA_USDC_MINT", "NEXT_PUBLIC_SOLANA_USDC_MINT"}, defaultDevnetUSDCMint),
			"USDT": envFirstOrDefault([]string{"SOLANA_USDT_MINT", "NEXT_PUBLIC_SOLANA_USDT_MINT"}, defaultDevnetUSDTMint),
		},
	}

	watcher := internal.Watcher{
		Chain:    "solana",
		Resolver: routeResolver,
		Publisher: internal.CallbackPublisher{
			Endpoint: callbackURL,
			Secret:   callbackSecret,
			Client:   &http.Client{Timeout: 8 * time.Second},
			Now:      time.Now,
		},
	}

	runner := internal.Runner{
		Name:            "solana-watcher",
		PollInterval:    time.Duration(envIntOrDefault("SOLANA_POLL_INTERVAL_MS", 5000)) * time.Millisecond,
		Source:          source,
		Watcher:         watcher,
		CheckpointStore: checkpointStore,
		DedupeStore:     dedupeStore,
		Logger:          log.Default(),
	}

	if err := runner.Run(ctx); err != nil {
		log.Fatalf("solana-watcher stopped with error: %v", err)
	}
}
