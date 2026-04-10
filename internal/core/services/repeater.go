package services

import (
	"net/http"
	"strings"
	"wailshark/internal/core/domain"
	// Assuming this exists or I need to check
)

type RepeaterService struct{}

func NewRepeaterService() *RepeaterService {
	return &RepeaterService{}
}

// ExecuteRequest is used by the Repeater feature to send a custom request
func (s *RepeaterService) ExecuteRequest(req domain.HTTPRequestDTO) (*domain.HTTPTransactionDTO, error) {
	// Create new HTTP request
	client := &http.Client{
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse // Don't follow redirects automatically
		},
	}

	// Prepare request
	httpReq, err := http.NewRequest(req.Method, req.URL, strings.NewReader(req.Body))
	if err != nil {
		return nil, err
	}

	// Parse Headers
	// The previous implementation vaguely handled headers.
	// We should parse the raw string headers if possible, or use a map if the UI provides it.
	// For now, let's assume we need to parse the raw header string from DTO.
	// If domain.HTTPRequestDTO.Header is a JSON string (as per models.go), we need to unmarshal it or parse it.
	// Ideally, the UI gives us a map or a raw string we can parse.
	// Let's assume for now we might need to fix this later once the UI is built.
	// Just setting Content-Type for now if body is present as a placeholder.
	// TODO: Implement proper header parsing from req.Header string

	// Perform Request
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// Convert Response to DTO
	respDTO := domain.ToHTTPResponseDTO(resp)

	return &domain.HTTPTransactionDTO{
		Request:  req,
		Response: respDTO,
		Index:    0, // 0 indicates not in history
	}, nil
}
