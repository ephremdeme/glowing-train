package internal

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type CoreAPIClient struct {
	BaseURL    string
	Secret     string
	Issuer     string
	Audience   string
	Subject    string
	HTTPClient *http.Client
}

func (c CoreAPIClient) Do(ctx context.Context, method string, path string, body any, out any) error {
	if c.BaseURL == "" {
		return fmt.Errorf("core api base url is required")
	}
	if c.Secret == "" {
		return fmt.Errorf("jwt secret is required")
	}

	httpClient := c.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 8 * time.Second}
	}

	var reqBody io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reqBody = bytes.NewReader(encoded)
	}

	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.BaseURL, "/")+path, reqBody)
	if err != nil {
		return err
	}

	if body != nil {
		req.Header.Set("content-type", "application/json")
	}

	token, err := c.createToken()
	if err != nil {
		return err
	}
	req.Header.Set("authorization", "Bearer "+token)

	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("core api request failed (%d): %s", resp.StatusCode, string(raw))
	}

	if out == nil {
		return nil
	}

	return json.NewDecoder(resp.Body).Decode(out)
}

func (c CoreAPIClient) createToken() (string, error) {
	now := time.Now().Unix()
	claims := map[string]any{
		"sub":       c.Subject,
		"iss":       c.Issuer,
		"aud":       c.Audience,
		"exp":       now + 60,
		"iat":       now,
		"tokenType": "service",
		"scope":     []string{"watchers:internal"},
	}

	header := map[string]any{"alg": "HS256", "typ": "JWT"}

	headerBytes, err := json.Marshal(header)
	if err != nil {
		return "", err
	}
	claimBytes, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}

	headerPart := base64.RawURLEncoding.EncodeToString(headerBytes)
	claimPart := base64.RawURLEncoding.EncodeToString(claimBytes)
	signingInput := headerPart + "." + claimPart

	mac := hmac.New(sha256.New, []byte(c.Secret))
	mac.Write([]byte(signingInput))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return signingInput + "." + signature, nil
}
