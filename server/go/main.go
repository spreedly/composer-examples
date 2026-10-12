package main

import (
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
	composer "github.com/spreedly/composer-sdk-server-go"
)

var sdkMeta = map[string]string{
	"language": "go",
	"package":  "github.com/spreedly/composer-sdk-server-go",
	"version":  composer.Version,
}

const missingConfigMessage = "Missing DODGEBALL_SECRET_KEY; copy .env.example to .env (SPREEDLY_SECRET_KEY also accepted)"
const invalidCheckpointBody = "Invalid checkpoint request: body must be JSON with a non-empty checkpointName string"

func envOr(primary, fallback string) string {
	if value := os.Getenv(primary); value != "" {
		return value
	}
	return os.Getenv(fallback)
}

func isAPIKeyConfigured() bool {
	apiKey := envOr("DODGEBALL_SECRET_KEY", "SPREEDLY_SECRET_KEY")
	return apiKey != "" && apiKey != "UNSET_SECRET_KEY"
}

type checkpointRequest struct {
	CheckpointName string                 `json:"checkpointName"`
	Payload        map[string]interface{} `json:"payload"`
	SessionId      string                 `json:"sessionId"`
	UserId         string                 `json:"userId"`
	SourceToken    string                 `json:"sourceToken"`
	VerificationId string                 `json:"verificationId"`
}

type verificationResponse struct {
	Id       string                 `json:"id"`
	Status   string                 `json:"status"`
	Outcome  string                 `json:"outcome"`
	StepData map[string]interface{} `json:"step_data"`
}

type checkpointSidecarResponse struct {
	Success        bool                  `json:"success"`
	Status         string                `json:"status"`
	Verification   *verificationResponse `json:"verification"`
	ErrorMessage   string                `json:"errorMessage,omitempty"`
}

func main() {
	_ = godotenv.Load()

	port := os.Getenv("PORT")
	if port == "" {
		port = "3024"
	}

	secretKey := envOr("DODGEBALL_SECRET_KEY", "SPREEDLY_SECRET_KEY")
	if secretKey == "" {
		secretKey = "UNSET_SECRET_KEY"
	}
	if !isAPIKeyConfigured() {
		log.Println("warning:", missingConfigMessage)
	}

	config := &composer.ComposerConfig{
		ApiVersion: composer.V1,
	}
	if apiUrl := envOr("DODGEBALL_API_URL", "SPREEDLY_API_URL"); apiUrl != "" {
		config.ApiUrl = apiUrl
	}

	client, err := composer.NewComposer(secretKey, config)
	if err != nil {
		log.Fatal(err)
	}

	http.HandleFunc("/healthz", healthzHandler)
	http.HandleFunc("/meta", metaHandler)
	http.HandleFunc("/checkpoint", checkpointHandler(client))

	log.Printf("Server is running on http://localhost:%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func healthzHandler(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":  true,
		"sdk": sdkMeta,
	})
}

func metaHandler(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, sdkMeta)
}

func checkpointHandler(client *composer.Composer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var body checkpointRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.CheckpointName) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": invalidCheckpointBody})
			return
		}

		if !isAPIKeyConfigured() {
			writeJSON(w, http.StatusOK, checkpointSidecarResponse{
				Success:      false,
				Status:       "isError",
				Verification: nil,
				ErrorMessage: missingConfigMessage,
			})
			return
		}

		ip, err := requestIP(r)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, checkpointSidecarResponse{
				Success:      false,
				Status:       "isError",
				Verification: nil,
				ErrorMessage: err.Error(),
			})
			return
		}

		payload := body.Payload
		if payload == nil {
			payload = map[string]interface{}{}
		}
		payload["exampleValueFromBackendOnly"] = "EXAMPLE_VALUE"

		response, err := client.Checkpoint(&composer.CheckpointOptions{
			CheckpointName: body.CheckpointName,
			Event: composer.CheckpointEvent{
				Ip:   ip,
				Data: payload,
			},
			SourceToken:       body.SourceToken,
			SessionId:         body.SessionId,
			UserId:            body.UserId,
			UseVerificationId: body.VerificationId,
		})

		if err != nil {
			writeJSON(w, http.StatusOK, checkpointSidecarResponse{
				Success:      false,
				Status:       "isError",
				Verification: nil,
				ErrorMessage: err.Error(),
			})
			return
		}

		var status string
		if client.IsAllowed(response) {
			status = "isAllowed"
		} else if client.IsRunning(response) {
			status = "isRunning"
		} else if client.IsDenied(response) {
			status = "isDenied"
		} else {
			status = "isError"
		}

		result := checkpointSidecarResponse{
			Success:      true,
			Status:       status,
			Verification: verificationToSidecar(response.Verification),
		}
		if status == "isError" {
			errorsJSON, marshalErr := json.Marshal(response.Errors)
			if marshalErr == nil {
				result.ErrorMessage = string(errorsJSON)
			}
		}

		writeJSON(w, http.StatusOK, result)
	}
}

func verificationToSidecar(verification *composer.ComposerVerification) *verificationResponse {
	if verification == nil {
		return nil
	}

	stepData := verification.StepData
	if stepData == nil {
		stepData = map[string]interface{}{}
	}

	return &verificationResponse{
		Id:       verification.Id,
		Status:   string(verification.Status),
		Outcome:  string(verification.Outcome),
		StepData: stepData,
	}
}

// Client IP for the risk engine. Callers must not choose this value.
// Default (TRUSTED_PROXY_COUNT=0): socket address, ignore X-Forwarded-For.
// Positive count: that many hops from the right of X-Forwarded-For; the hop must be an IP.
func requestIP(r *http.Request) (string, error) {
	raw := os.Getenv("TRUSTED_PROXY_COUNT")
	if raw == "" {
		raw = "0"
	}
	hops, err := strconv.Atoi(raw)
	if err != nil || hops < 0 {
		return "", errors.New("Cannot derive client IP: TRUSTED_PROXY_COUNT is not a valid hop count")
	}

	parts := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}

	var candidate string
	if hops == 0 {
		host, _, splitErr := net.SplitHostPort(r.RemoteAddr)
		if splitErr != nil {
			host = r.RemoteAddr
		}
		candidate = host
	} else if hops <= len(parts) {
		candidate = parts[len(parts)-hops]
	}

	if net.ParseIP(candidate) == nil {
		return "", errors.New("Cannot derive client IP: no valid IP for this TRUSTED_PROXY_COUNT")
	}
	return candidate, nil
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("failed to encode JSON response: %v", err)
	}
}
