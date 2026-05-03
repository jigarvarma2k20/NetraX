package domain

import (
	"bytes"
	"compress/gzip"
	"compress/zlib"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/andybalholm/brotli"
	"github.com/jigarvarma2k20/netrax/internal/utils/parser"
	"github.com/klauspost/compress/zstd"
	"golang.org/x/net/html/charset"
	"golang.org/x/text/transform"
)

type FilterOptions struct {
	SearchQuery string   `json:"searchQuery"`
	StatusCodes []string `json:"statusCodes"` // "2xx", "3xx", "4xx", "5xx"
	HideMedia   bool     `json:"hideMedia"`
	HideCSS     bool     `json:"hideCSS"`
	HideJS      bool     `json:"hideJS"`
	SortBy      string   `json:"sortBy"`
	SortDesc    bool     `json:"sortDesc"`
}

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

func decodeBody(raw []byte, headers http.Header) ([]byte, string) {
	if len(raw) == 0 {
		return raw, ""
	}

	encoding := strings.ToLower(headers.Get("Content-Encoding"))
	var body []byte

	switch {
	case encoding == "gzip" || bytes.HasPrefix(raw, []byte{0x1f, 0x8b}):
		gr, err := gzip.NewReader(bytes.NewReader(raw))
		if err == nil {
			defer gr.Close()
			body, _ = io.ReadAll(gr)
		} else {
			body = raw
		}

	case encoding == "br":
		br := brotli.NewReader(bytes.NewReader(raw))
		body, _ = io.ReadAll(br)

	case encoding == "deflate" || bytes.HasPrefix(raw, []byte{0x78, 0x9c}):
		zr, err := zlib.NewReader(bytes.NewReader(raw))
		if err == nil {
			defer zr.Close()
			body, _ = io.ReadAll(zr)
		} else {
			body = raw
		}

	case encoding == "zstd":
		dec, err := zstd.NewReader(bytes.NewReader(raw))
		if err == nil {
			defer dec.Close()
			body, _ = io.ReadAll(dec)
		} else {
			body = raw
		}

	default:
		body = raw
	}

	ct := strings.ToLower(headers.Get("Content-Type"))

	isText := strings.Contains(ct, "text") ||
		strings.Contains(ct, "json") ||
		strings.Contains(ct, "xml") ||
		strings.Contains(ct, "html") ||
		strings.Contains(ct, "form-urlencoded")

	if len(body) > 0 && !isText {
		printable := 0
		for i := 0; i < len(body) && i < 100; i++ {
			if body[i] >= 32 && body[i] <= 126 {
				printable++
			}
		}
		if printable > 70 {
			isText = true
		}
	}

	if !isText {
		return body, fmt.Sprintf("[binary data %d bytes]", len(body))
	}

	reader, err := charset.NewReader(bytes.NewReader(body), ct)
	if err == nil {
		decoded, _ := io.ReadAll(reader)
		return body, string(decoded)
	}

	e, _, _ := charset.DetermineEncoding(body, ct)
	decodedReader := transform.NewReader(bytes.NewReader(body), e.NewDecoder())
	decoded, _ := io.ReadAll(decodedReader)

	return body, string(decoded)
}

func ToHTTPRequestDTO(r *http.Request) HTTPRequestDTO {
	if r == nil {
		return HTTPRequestDTO{}
	}

	raw := []byte{}
	if r.Body != nil {
		raw, _ = io.ReadAll(r.Body)
	}

	decoded, bodyStr := decodeBody(raw, r.Header)

	// restore original raw body
	r.Body = io.NopCloser(bytes.NewBuffer(raw))

	var headers string = "{}"
	if r.Header != nil {
		h, err := parser.HeadersToJSON(r.Header.Clone())
		if err == nil {
			headers = h
		}
	}

	var transferEncoding string = "[]"
	if r.TransferEncoding != nil {
		te, err := parser.HeadersToJSON(r.TransferEncoding)
		if err == nil {
			transferEncoding = te
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
		ContentLength:    int64(len(decoded)),
		TransferEncoding: transferEncoding,
		Close:            r.Close,
		Body:             bodyStr,
	}
}

func ToHTTPResponseDTO(resp *http.Response) HTTPResponseDTO {
	if resp == nil {
		return HTTPResponseDTO{}
	}

	raw := []byte{}
	if resp.Body != nil {
		raw, _ = io.ReadAll(resp.Body)
	}

	decoded, bodyStr := decodeBody(raw, resp.Header)

	// restore original raw body (IMPORTANT)
	resp.Body = io.NopCloser(bytes.NewBuffer(raw))

	var headers string = "{}"
	var contentType string

	if resp.Header != nil {
		h, err := parser.HeadersToJSON(resp.Header.Clone())
		if err == nil {
			headers = h
		}
		contentType = resp.Header.Get("Content-Type")
	}

	return HTTPResponseDTO{
		Status:        resp.Status,
		StatusCode:    resp.StatusCode,
		Proto:         resp.Proto,
		Header:        headers,
		ContentLength: len(decoded),
		ContentType:   contentType,
		Body:          bodyStr,
	}
}

type AppStats struct {
	TotalRequests        int            `json:"totalRequests"`
	ResponsesCaptured    int            `json:"responsesCaptured"`
	ErrorResponses       int            `json:"errorResponses"`
	UniqueHosts          int            `json:"uniqueHosts"`
	TotalResponseBytes   int64          `json:"totalResponseBytes"`
	MethodCounts         map[string]int `json:"methodCounts"`
	HostCounts           map[string]int `json:"hostCounts"`
}
