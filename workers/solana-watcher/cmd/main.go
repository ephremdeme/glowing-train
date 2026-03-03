package main

import (
	"context"
	"log"
	"log/slog"
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
	defaultDevnetProgramID = "5i3vNJHo7Jkpg549uHtsKvGiEy77SmS5NKDZGwCo8Fwp"
	defaultDevnetUSDCMint = "6bDUveKHvCojQNt5VzsvLpScyQyDwScFVzw7mGTRP3Km"
	defaultDevnetUSDTMint = "2Seg9ZgkCyyqdEgTkNcxG2kszh9S2GrAzcY6XjPhtGJn"
	defaultDevnetUSDCTreasuryATA = "89sfbTtBCGX3zCCooh4zGoxaATFEvZNWdkNjDGzCeqBu"
	defaultDevnetUSDTTreasuryATA = "FFn5nBjuZLj4WBxyzUvXTs185LxpAXt4wLSRqs6KabqR"
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
		HTTPClient: &http.Client{Timeout: 15 * time.Second},
	}

	routeResolver := internal.CoreAPIRouteResolver{Client: &client, WatcherName: "solana-watcher"}
	routeStore := internal.CoreAPIRouteStore{Client: &client}
	checkpointStore := internal.CoreAPICheckpointStore{Client: &client, WatcherName: "solana-watcher", Chain: "solana"}
	dedupeStore := internal.CoreAPIDedupeStore{Client: &client, WatcherName: "solana-watcher"}

	source := internal.SolanaRpcSource{
		RPCURL:     rpcURL,
		HTTPClient:   &http.Client{Timeout: 60 * time.Second},
		RouteStore: routeStore,
		ProgramID:  envFirstOrDefault([]string{"SOLANA_PROGRAM_ID", "NEXT_PUBLIC_SOLANA_PROGRAM_ID"}, defaultDevnetProgramID),
		Chain:      "solana",
		Limit:      envIntOrDefault("SOLANA_SIGNATURE_LIMIT", 100),
		TokenMints: map[string]string{
			"USDC": envFirstOrDefault([]string{"SOLANA_USDC_MINT", "NEXT_PUBLIC_SOLANA_USDC_MINT"}, defaultDevnetUSDCMint),
			"USDT": envFirstOrDefault([]string{"SOLANA_USDT_MINT", "NEXT_PUBLIC_SOLANA_USDT_MINT"}, defaultDevnetUSDTMint),
		},
		TreasuryATAs: map[string]string{
			"USDC": envFirstOrDefault([]string{"SOLANA_USDC_TREASURY_ATA", "NEXT_PUBLIC_SOLANA_USDC_TREASURY_ATA"}, defaultDevnetUSDCTreasuryATA),
			"USDT": envFirstOrDefault([]string{"SOLANA_USDT_TREASURY_ATA", "NEXT_PUBLIC_SOLANA_USDT_TREASURY_ATA"}, defaultDevnetUSDTTreasuryATA),
		},
	}

	watcher := internal.Watcher{
		Chain:    "solana",
		Resolver: routeResolver,
		Publisher: internal.CallbackPublisher{
			Endpoint:   callbackURL,
			Secret:     callbackSecret,
			APIClient:  &client,
			Client:     &http.Client{Timeout: 15 * time.Second},
			Now:        time.Now,
		},
	}

	runner := internal.Runner{
		Name:            "solana-watcher",
		PollInterval:    time.Duration(envIntOrDefault("SOLANA_POLL_INTERVAL_MS", 5000)) * time.Millisecond,
		Source:          source,
		Watcher:         watcher,
		CheckpointStore: checkpointStore,
		DedupeStore:     dedupeStore,
		Logger:          slog.Default(),
	}

	if err := runner.Run(ctx); err != nil {
		log.Fatalf("solana-watcher stopped with error: %v", err)
	}
}
