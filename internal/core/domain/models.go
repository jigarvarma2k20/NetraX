package domain

import (
	"bytes"
	"fmt"
	"io"
	"net/http"

	"github.com/jigarvarma2k20/netrax/internal/utils/parser"
)

type HTTPTransactionDTO struct {
	Request  HTTPRequestDTO  `json:"request"`
	Response HTTPResponseDTO `json:"response,omitempty"`
	Index    int64           `json:"index"`
}

type HTTPRequestDTO struct {
	ID               int64  `json:"id,omitempty"`
	Method           string `json:"method"`
	URL              string `json:"url"`
	Proto            string `json:"proto"`
	Host             string `json:"host"`
	RemoteAddr       string `json:"remote_addr"`
	Header           string `json:"header"`
	ContentLength    int64  `json:"content_length"`
	TransferEncoding string `json:"transfer_encoding"`
	Close            bool   `json:"close"`
	Body             string `json:"body"`
}

type HTTPResponseDTO struct {
	ID            int64  `json:"id,omitempty"`
	Status        string `json:"status"`
	StatusCode    int    `json:"status_code"`
	Proto         string `json:"proto"`
	Header        string `json:"header"`
	ContentLength int    `json:"content_length"`
	ContentType   string `json:"content_type"`
	Body          string `json:"body"`
}

func ToHTTPRequestDTO(r *http.Request) HTTPRequestDTO {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		body = nil // Handle error appropriately, maybe log it
	}
	r.Body = io.NopCloser(io.Reader(bytes.NewBuffer(body))) // Reset the body for further use

	headers, err := parser.HeadersToJSON(r.Header)
	if err != nil {
		fmt.Printf("Failed to convert headers to JSON: %v", err)
	}

	transferEncoding, err := parser.HeadersToJSON(r.TransferEncoding)
	if err != nil {
		fmt.Printf("Failed to convert transfer encoding to JSON: %v", err)
		transferEncoding = "[]"
	}

	return HTTPRequestDTO{
		Method:           r.Method,
		URL:              r.URL.String(),
		Proto:            r.Proto,
		Host:             r.Host,
		RemoteAddr:       r.RemoteAddr,
		Header:           headers,
		ContentLength:    r.ContentLength,
		TransferEncoding: transferEncoding,
		Close:            r.Close,
		Body:             string(body),
	}
}

func ToHTTPResponseDTO(resp *http.Response) HTTPResponseDTO {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		body = nil // Handle error appropriately, maybe log it
	}

	resp.Body = io.NopCloser(io.Reader(bytes.NewBuffer(body))) // Reset the body for further use

	headers, err := parser.HeadersToJSON(resp.Header)
	if err != nil {
		fmt.Printf("Failed to convert headers to JSON: %v", err)
	}
	// now read copy for DTO
	return HTTPResponseDTO{
		Status:        resp.Status,
		StatusCode:    resp.StatusCode,
		Proto:         resp.Proto,
		Header:        headers,
		ContentLength: len(body), // incase of chunked transfer encoding, this will be -1 so
		ContentType:   resp.Header.Get("Content-Type"),
		Body:          string(body),
	}
}
