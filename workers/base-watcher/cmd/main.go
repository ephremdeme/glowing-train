package main

import (
	"context"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
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

func envBoolOrDefault(name string, fallback bool) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(name)))
	if value == "" {
		return fallback
	}

	switch value {
	case "1", "true", "t", "yes", "y", "on":
		return true
	case "0", "false", "f", "no", "n", "off":
		return false
	default:
		return fallback
	}
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	coreAPIURL := envOrDefault("CORE_API_URL", "http://localhost:3001")
	rpcURL := strings.TrimSpace(os.Getenv("BASE_RPC_URL"))
	if rpcURL == "" {
		log.Fatalf("missing required BASE_RPC_URL for base-watcher")
	}
	usdcContract := strings.TrimSpace(os.Getenv("BASE_USDC_CONTRACT"))
	if usdcContract == "" {
		log.Fatalf("missing required BASE_USDC_CONTRACT for base-watcher")
	}
	usdtContract := strings.TrimSpace(os.Getenv("BASE_USDT_CONTRACT"))
	if usdtContract == "" {
		log.Fatalf("missing required BASE_USDT_CONTRACT for base-watcher")
	}
	callbackURL := envOrDefault("CORE_API_FUNDING_CALLBACK_URL", "http://localhost:3001/internal/v1/funding-confirmed")
	callbackSecret := envOrDefault("WATCHER_CALLBACK_SECRET", "dev-callback-secret-change-me")
	minConfirmations := envIntOrDefault("BASE_MIN_CONFIRMATIONS", 3)
	pollIntervalMs := envIntOrDefault("BASE_POLL_INTERVAL_MS", 5000)
	maxBlockSpan := envIntOrDefault("BASE_LOG_QUERY_BLOCK_SPAN", 250)
	factoryLevelScan := envBoolOrDefault("BASE_FACTORY_LEVEL_SCAN", false)

	slog.Info("base-watcher effective config",
		"coreApiUrl", coreAPIURL,
		"rpcUrl", rpcURL,
		"usdcContract", usdcContract,
		"usdtContract", usdtContract,
		"minConfirmations", minConfirmations,
		"pollIntervalMs", pollIntervalMs,
		"maxBlockSpan", maxBlockSpan,
		"factoryLevelScan", factoryLevelScan,
	)

	client := internal.CoreAPIClient{
		BaseURL:    coreAPIURL,
		Secret:     envOrDefault("AUTH_JWT_SECRET", "dev-jwt-secret-change-me"),
		Issuer:     envOrDefault("AUTH_JWT_ISSUER", "cryptopay-internal"),
		Audience:   envOrDefault("AUTH_JWT_AUDIENCE", "cryptopay-services"),
		Subject:    "base-watcher",
		HTTPClient: &http.Client{Timeout: 15 * time.Second},
	}

	routeResolver := internal.CoreAPIRouteResolver{Client: &client, WatcherName: "base-watcher"}
	routeStore := internal.CoreAPIRouteStore{Client: &client}
	checkpointStore := internal.CoreAPICheckpointStore{Client: &client, WatcherName: "base-watcher", Chain: "base"}
	dedupeStore := internal.CoreAPIDedupeStore{Client: &client, WatcherName: "base-watcher"}

	source := internal.EvmRpcSource{
		RPCURL:                 rpcURL,
		HTTPClient:             &http.Client{Timeout: 30 * time.Second},
		RouteStore:             routeStore,
		Chain:                  "base",
		FactoryLevelScan:       factoryLevelScan,
		FinalizedConfirmations: minConfirmations,
		MaxBlockSpan:           int64(maxBlockSpan),
		TokenContracts: map[string]string{
			"USDC": usdcContract,
			"USDT": usdtContract,
		},
	}

	watcher := internal.Watcher{
		Chain:            "base",
		MinConfirmations: minConfirmations,
		Resolver:         routeResolver,
		Publisher: internal.CallbackPublisher{
			Endpoint:  callbackURL,
			Secret:    callbackSecret,
			APIClient: &client,
			Client:    &http.Client{Timeout: 15 * time.Second},
			Now:       time.Now,
		},
	}

	runner := internal.Runner{
		Name:            "base-watcher",
		PollInterval:    time.Duration(pollIntervalMs) * time.Millisecond,
		Source:          source,
		Watcher:         watcher,
		CheckpointStore: checkpointStore,
		DedupeStore:     dedupeStore,
		Logger:          slog.Default(),
	}

	if err := runner.Run(ctx); err != nil {
		log.Fatalf("base-watcher stopped with error: %v", err)
	}
}
