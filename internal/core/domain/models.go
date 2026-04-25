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
	if r == nil {
		return HTTPRequestDTO{}
	}

	var body []byte
	var err error
	if r.Body != nil {
		body, err = io.ReadAll(r.Body)
		if err != nil {
			body = nil
		}
		r.Body = io.NopCloser(bytes.NewBuffer(body))
	}

	var headers string = "{}"
	if r.Header != nil {
		headers, err = parser.HeadersToJSON(r.Header.Clone())
		if err != nil {
			fmt.Printf("Failed to convert headers to JSON: %v\n", err)
			headers = "{}"
		}
	}

	var transferEncoding string = "[]"
	if r.TransferEncoding != nil {
		transferEncoding, err = parser.HeadersToJSON(r.TransferEncoding)
		if err != nil {
			fmt.Printf("Failed to convert transfer encoding to JSON: %v\n", err)
			transferEncoding = "[]"
		}
	}

	urlStr := ""
	if r.URL != nil {
		urlStr = r.URL.String()
	}

	return HTTPRequestDTO{
		Method:           r.Method,
		URL:              urlStr,
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
	if resp == nil {
		return HTTPResponseDTO{}
	}

	var body []byte
	var err error
	if resp.Body != nil {
		body, err = io.ReadAll(resp.Body)
		if err != nil {
			body = nil
		}
		resp.Body = io.NopCloser(bytes.NewBuffer(body))
	}

	var headers string = "{}"
	var contentType string = ""
	if resp.Header != nil {
		headers, err = parser.HeadersToJSON(resp.Header.Clone())
		if err != nil {
			fmt.Printf("Failed to convert headers to JSON: %v\n", err)
			headers = "{}"
		}
		contentType = resp.Header.Get("Content-Type")
	}

	return HTTPResponseDTO{
		Status:        resp.Status,
		StatusCode:    resp.StatusCode,
		Proto:         resp.Proto,
		Header:        headers,
		ContentLength: len(body),
		ContentType:   contentType,
		Body:          string(body),
	}
}
