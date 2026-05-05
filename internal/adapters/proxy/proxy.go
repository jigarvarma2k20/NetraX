// This file is part of NetraX.
// Repository: https://github.com/jigarvarma2k20/NetraX
//
// Copyright (c) 2026 NetraX Contributors
//
// SPDX-License-Identifier: GPL-3.0

package proxy

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jigarvarma2k20/netrax/internal/adapters/persistence/sqlite"
	"github.com/jigarvarma2k20/netrax/internal/config"
	"github.com/jigarvarma2k20/netrax/internal/core/domain"
	"github.com/jigarvarma2k20/netrax/internal/core/ports"
	"github.com/jigarvarma2k20/netrax/internal/utils/parser"

	"github.com/elazarl/goproxy"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

var html = `<!DOCTYPE html>
<html>
<head>
  <title>NetraX Proxy</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      padding: 40px;
      font-size: 22px;
      color: #222;
    }
    .card {
      border: 1px solid #ddd;
      padding: 32px;
      max-width: 700px;
    }
    h1 {
      margin-bottom: 10px;
      color: #f59e0b;
    }
    a {
      color: #543cf3;
      text-decoration: none;
      font-weight: 500;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>NetraX Proxy</h1>

    <p>This proxy is active and ready.</p>
    <p><a href="/cert">Download Certificate</a></p>
  </div>
</body>
</html>`

type ProxyHandler struct {
	Bindings                    []ports.ProxyBinding
	Ctx                         context.Context // Context for the proxy operations
	DB                          *sqlite.DB
	InterceptEnabled            atomic.Bool
	InterceptRegex              string
	interceptCompiled           *regexp.Regexp
	PendingRequests             sync.Map // key: id (int64), value: chan InterceptAction
	PendingResponses            sync.Map // key: id (int64), value: chan InterceptAction
	RequestsToInterceptResponse sync.Map // key: id (int64), value: bool
	InterceptResponses          atomic.Bool
	Servers                     map[string]*http.Server
	serverMu                    sync.Mutex
}

type InterceptAction struct {
	Type             string // "forward", "drop"
	ModifiedRequest  *domain.HTTPRequestDTO
	ModifiedResponse *domain.HTTPResponseDTO
}

const interceptDecisionTimeout = 60 * time.Second

func sendInterceptAction(ch chan InterceptAction, action InterceptAction) bool {
	select {
	case ch <- action:
		return true
	default:
		return false
	}
}

func NewProxyHandler(db *sqlite.DB) *ProxyHandler {
	p := &ProxyHandler{
		DB: db,
	}
	p.SetDefaults()
	return p
}

func (p *ProxyHandler) SetDB(db *sqlite.DB) {
	p.DB = db
}

func (p *ProxyHandler) New(port int) *ProxyHandler {
	return &ProxyHandler{Bindings: []ports.ProxyBinding{{Address: ports.DefaultProxyAddress, Port: port}}}
}

func (p *ProxyHandler) SendToFrontend(event string, data any) {
	if p.Ctx != nil {
		// Use the runtime package to send data to the frontend
		runtime.EventsEmit(p.Ctx, event, data)
	} else {
		log.Println("Context is not set, cannot send to frontend")
	}
}

func (p *ProxyHandler) AddRequest(req *http.Request) int64 {

	dto := domain.ToHTTPRequestDTO(req)
	id, err := p.DB.InsertRequest(&dto)
	if err != nil {
		log.Printf("Failed to insert request into DB: %v", err)
	}

	p.SendToFrontend("newRequestRecived", id)
	return id

}

func (p *ProxyHandler) AddResponse(request_id int64, resp *http.Response) {

	dto := domain.ToHTTPResponseDTO(resp)
	_, err := p.DB.InsertResponse(&dto, request_id)
	if err != nil {
		log.Printf("Failed to insert response into DB: %v", err)
	}

	p.SendToFrontend("requestWithResponse", request_id)
}

func (p *ProxyHandler) SetContext(ctx context.Context) {
	p.Ctx = ctx
}

func (p *ProxyHandler) SetPort(port int) {
	p.SetDefaults()
	p.Bindings[0].Port = port
}

func (p *ProxyHandler) GetPort() int {
	p.SetDefaults()
	return p.Bindings[0].Port
}

func (p *ProxyHandler) SetDefaults() {
	if len(p.Bindings) == 0 {
		p.Bindings = []ports.ProxyBinding{{Address: ports.DefaultProxyAddress, Port: ports.DefaultProxyPort}}
	}
}

func (p *ProxyHandler) GetBindings() []ports.ProxyBinding {
	p.serverMu.Lock()
	defer p.serverMu.Unlock()

	bindings := make([]ports.ProxyBinding, len(p.Bindings))
	copy(bindings, p.Bindings)
	return bindings
}

// parseCA loads the CA cert and key from files and returns a *tls.Certificate
func (p *ProxyHandler) parseCA(caCertPath, caKeyPath string) (*tls.Certificate, error) {
	caCert, err := os.ReadFile(caCertPath)
	if err != nil {
		return nil, err
	}
	caKey, err := os.ReadFile(caKeyPath)
	if err != nil {
		return nil, err
	}
	parsedCert, err := tls.X509KeyPair(caCert, caKey)
	if err != nil {
		return nil, err
	}
	parsedCert.Leaf, err = x509.ParseCertificate(parsedCert.Certificate[0])
	if err != nil {
		return nil, err
	}
	return &parsedCert, nil
}

func (p *ProxyHandler) Start() {
	p.SetDefaults()

	settings := config.LoadSettings()
	resolvedBindings, err := ports.ResolveBindings(settings.ProxyBindings, settings.ProxyAddr, settings.ProxyPort)
	if err != nil {
		log.Printf("Invalid proxy bindings in settings, falling back to defaults: %v", err)
		resolvedBindings = []ports.ProxyBinding{{Address: ports.DefaultProxyAddress, Port: ports.DefaultProxyPort}}
	}

	p.serverMu.Lock()
	p.Bindings = resolvedBindings
	p.serverMu.Unlock()

	// Create a new proxy instance
	proxy := goproxy.NewProxyHttpServer()

	// Serve a simple HTML page for direct access (non-proxy requests)
	proxy.NonproxyHandler = http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.URL.Path == "/" {
			w.Header().Set("Content-Type", "text/html")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(html))
			return
		} else if req.URL.Path == "/cert" {
			certPath, _ := config.GetCertPath()
			caCertData, err := os.ReadFile(certPath)
			if err != nil {
				http.Error(w, "Certificate not found", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/x-x509-ca-cert")
			w.Header().Set("Content-Disposition", `attachment; filename="netrax-ca.crt"`)
			w.WriteHeader(http.StatusOK)
			w.Write(caCertData)
			return
		}
		http.Error(w, "This is a proxy server. Does not respond to non-proxy requests.", http.StatusInternalServerError)
	})

	certPath, _ := config.GetCertPath()
	keyPath, _ := config.GetKeyPath()
	if err := config.EnsureCA(); err != nil {
		log.Printf("Failed to ensure CA: %v", err)
		return
	}

	cert, err := p.parseCA(certPath, keyPath)
	if err != nil {
		log.Printf("Failed to parse CA certificate: %v", err)
		return
	}
	// Set up the proxy to use the custom CA for MITM
	customCaMitm := &goproxy.ConnectAction{Action: goproxy.ConnectMitm, TLSConfig: goproxy.TLSConfigFromCA(cert)}
	var customAlwaysMitm goproxy.FuncHttpsHandler = func(host string, ctx *goproxy.ProxyCtx) (*goproxy.ConnectAction, string) {
		return customCaMitm, host
	}

	proxy.OnRequest().HandleConnect(customAlwaysMitm)

	// Intercept all HTTP requests
	proxy.OnRequest().DoFunc(
		func(req *http.Request, ctx *goproxy.ProxyCtx) (*http.Request, *http.Response) {

			id := p.AddRequest(req) // Store the request
			ctx.UserData = id

			if p.InterceptEnabled.Load() {
				// Regex bypass check
				if p.interceptCompiled != nil && !p.interceptCompiled.MatchString(req.Host) && !p.interceptCompiled.MatchString(req.URL.String()) {
					return req, nil
				}

				// Block request
				actionChan := make(chan InterceptAction, 1)
				p.PendingRequests.Store(id, actionChan)

				// Notify frontend
				p.SendToFrontend("interceptedRequest", id)

				// Wait for action
				// Wait for action
				var action InterceptAction
				select {
				case action = <-actionChan:
				case <-time.After(interceptDecisionTimeout):
					log.Printf("Request intercept timeout for ID %d, forwarding automatically", id)
					action = InterceptAction{Type: "forward"}
				case <-req.Context().Done():
					p.PendingRequests.Delete(id)
					return req, nil
				}
				p.PendingRequests.Delete(id)

				if action.Type == "drop" {
					return req, goproxy.NewResponse(req, goproxy.ContentTypeText, http.StatusForbidden, "Request Dropped by NetraX")
				}
				if action.Type == "forward" && action.ModifiedRequest != nil {
					// Apply modifications
					mod := action.ModifiedRequest

					// Method
					req.Method = mod.Method

					// URL & Host
					if mod.URL != "" {
						newURL, err := url.Parse(mod.URL)
						if err == nil {
							req.URL = newURL
							req.Host = newURL.Host
							req.RequestURI = "" // Critical: Execute new URL, otherwise Client uses old URI
						} else {
							log.Printf("Failed to parse modified URL: %v", err)
						}
					}

					// Headers
					if mod.Header != "" {
						headers, err := parser.HeadersFromJSON(mod.Header)
						if err == nil {
							req.Header = headers
						} else {
							log.Printf("Failed to parse modified headers: %v", err)
						}
					}

					if req.Header == nil {
						req.Header = make(http.Header)
					}

					// Body
					newBody := io.NopCloser(strings.NewReader(mod.Body))
					req.Body = newBody
					req.ContentLength = int64(len(mod.Body))
					req.Header.Set("Content-Length", fmt.Sprintf("%d", req.ContentLength))
					req.TransferEncoding = nil // Clear TE if we set CL
				}
			}

			return req, nil
		})

	// Intercept all HTTP responses
	proxy.OnResponse().DoFunc(
		func(resp *http.Response, ctx *goproxy.ProxyCtx) *http.Response {
			if resp == nil {
				return resp
			}

			var id int64
			if idx, ok := ctx.UserData.(int64); ok {
				id = idx
			}

			// Capture response
			if id != 0 {
				p.AddResponse(id, resp)

				// Check for Interception
				// Only intercept if explicitly requested for this ID
				var shouldIntercept bool
				if val, ok := p.RequestsToInterceptResponse.Load(id); ok {
					if b, ok := val.(bool); ok {
						shouldIntercept = b
					}
				}

				if shouldIntercept {
					// Clean up map if it was a one-time intercept
					p.RequestsToInterceptResponse.Delete(id)

					actionChan := make(chan InterceptAction, 1)
					p.PendingResponses.Store(id, actionChan)

					p.SendToFrontend("interceptedResponse", id)

					log.Printf("Waiting for action for ID %d", id)
					var action InterceptAction
					select {
					case action = <-actionChan:
						log.Printf("Received action for ID %d: %s", id, action.Type)
					case <-time.After(interceptDecisionTimeout):
						log.Printf("Response intercept timeout for ID %d, forwarding automatically", id)
						action = InterceptAction{Type: "forward"}
					case <-resp.Request.Context().Done():
						log.Printf("Context Done for ID %d. Err: %v", id, resp.Request.Context().Err())
						p.PendingResponses.Delete(id)
						return resp
					}
					p.PendingResponses.Delete(id)

					if action.Type == "drop" {
						return goproxy.NewResponse(resp.Request, goproxy.ContentTypeText, http.StatusForbidden, "Response Dropped by NetraX")
					}
					if action.Type == "forward" && action.ModifiedResponse != nil {
						// Apply modifications to resp
						mod := action.ModifiedResponse

						// Status
						if mod.StatusCode != 0 {
							log.Printf("Applying modified status: %d", mod.StatusCode)
							resp.StatusCode = mod.StatusCode
							resp.Status = fmt.Sprintf("%d %s", mod.StatusCode, http.StatusText(mod.StatusCode))
						}

						// Headers
						if mod.Header != "" {
							log.Println("Applying modified headers")
							headers, err := parser.HeadersFromJSON(mod.Header)
							if err == nil {
								resp.Header = headers
							} else {
								log.Printf("Failed to parse modified headers: %v", err)
							}
						}

						if resp.Header == nil {
							resp.Header = make(http.Header)
						}

						// Strip encoding headers
						resp.Header.Del("Content-Encoding")
						resp.Header.Del("Transfer-Encoding")
						resp.TransferEncoding = nil

						// Body
						if mod.Body != "" {
							log.Printf("Applying modified body of length: %d", len(mod.Body))
						}
						newBody := io.NopCloser(strings.NewReader(mod.Body))
						resp.Body = newBody
						resp.ContentLength = int64(len(mod.Body))
						resp.Header.Set("Content-Length", fmt.Sprintf("%d", resp.ContentLength))
					}
				}
			}

			return resp
		})

	p.serverMu.Lock()
	p.Servers = make(map[string]*http.Server, len(resolvedBindings))
	for _, binding := range resolvedBindings {
		bindAddr := ports.ListenAddress(binding)
		p.Servers[bindAddr] = &http.Server{
			Addr:    bindAddr,
			Handler: proxy,
		}
	}
	servers := make([]*http.Server, 0, len(p.Servers))
	for _, srv := range p.Servers {
		servers = append(servers, srv)
	}
	p.serverMu.Unlock()

	var wg sync.WaitGroup
	for _, srv := range servers {
		wg.Add(1)
		go func(server *http.Server) {
			defer wg.Done()
			log.Println("Starting HTTP proxy on", server.Addr)
			serveErr := server.ListenAndServe()
			if serveErr != nil && serveErr != http.ErrServerClosed {
				log.Printf("Proxy server error on %s: %v", server.Addr, serveErr)
			}
		}(srv)
	}

	wg.Wait()
}

func (p *ProxyHandler) Restart() {
	p.serverMu.Lock()
	for bindAddr, server := range p.Servers {
		if err := server.Close(); err != nil {
			log.Printf("Failed to close proxy server on %s: %v", bindAddr, err)
		}
	}
	p.Servers = nil
	p.serverMu.Unlock()

	go p.Start()
}

func (p *ProxyHandler) SetInterceptRegex(regexStr string) {
	p.serverMu.Lock()
	defer p.serverMu.Unlock()
	p.InterceptRegex = regexStr
	if regexStr != "" {
		c, err := regexp.Compile(regexStr)
		if err == nil {
			p.interceptCompiled = c
			log.Printf("Proxy Interceptor compiled Domain Filter Regex: %s", regexStr)
		} else {
			log.Printf("Failed to compile Domain Filter Regex: %v", err)
			p.interceptCompiled = nil
		}
	} else {
		p.interceptCompiled = nil
	}
}

func (p *ProxyHandler) SetIntercept(enabled bool) {
	p.InterceptEnabled.Store(enabled)
	p.SendToFrontend("interceptStatus", enabled)
	if !enabled {
		p.SetInterceptRegex("")
		p.interceptCompiled = nil
		p.FlushPending()
	}
}

func (p *ProxyHandler) FlushPending() {
	log.Println("FlushPending called")
	p.PendingRequests.Range(func(key, value any) bool {
		if ch, ok := value.(chan InterceptAction); ok {
			sendInterceptAction(ch, InterceptAction{Type: "forward"})
		}
		p.PendingRequests.Delete(key)
		return true
	})

	p.PendingResponses.Range(func(key, value any) bool {
		if ch, ok := value.(chan InterceptAction); ok {
			sendInterceptAction(ch, InterceptAction{Type: "forward"})
		}
		p.PendingResponses.Delete(key)
		return true
	})
}

func (p *ProxyHandler) HandleRequestAction(id int64, actionType string, modifiedReq *domain.HTTPRequestDTO) {
	if val, ok := p.PendingRequests.Load(id); ok {
		if ch, ok := val.(chan InterceptAction); ok {
			var action InterceptAction
			if actionType == "forward_and_intercept" {
				p.RequestsToInterceptResponse.Store(id, true)
				// Change action type to forward for the proxy logic
				action = InterceptAction{Type: "forward", ModifiedRequest: modifiedReq}
			} else {
				action = InterceptAction{Type: actionType, ModifiedRequest: modifiedReq}
			}

			if !sendInterceptAction(ch, action) {
				log.Printf("Skipping stale request action for ID %d", id)
			}
		}
	}
}

func (p *ProxyHandler) HandleResponseAction(id int64, actionType string, modifiedResp *domain.HTTPResponseDTO) {
	log.Printf("HandleResponseAction called for ID %d with action %s", id, actionType)
	if val, ok := p.PendingResponses.Load(id); ok {
		if ch, ok := val.(chan InterceptAction); ok {
			if !sendInterceptAction(ch, InterceptAction{Type: actionType, ModifiedResponse: modifiedResp}) {
				log.Printf("Skipping stale response action for ID %d", id)
			}
		}
	} else {
		log.Printf("Failed to find pending response channel for ID %d", id)
	}
}

// GetPendingRequests returns all pending HTTP requests currently blocked by the proxy
func (p *ProxyHandler) GetPendingRequests() []int64 {
	var ids []int64
	p.PendingRequests.Range(func(key, value any) bool {
		if id, ok := key.(int64); ok {
			ids = append(ids, id)
		}
		return true
	})
	return ids
}

// GetPendingResponses returns all pending HTTP responses currently blocked by the proxy
func (p *ProxyHandler) GetPendingResponses() []int64 {
	var ids []int64
	p.PendingResponses.Range(func(key, value any) bool {
		if id, ok := key.(int64); ok {
			ids = append(ids, id)
		}
		return true
	})
	return ids
}
