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
	"strings"
	"sync"
	"sync/atomic"
	"wailshark/internal/adapters/persistence/sqlite"
	"wailshark/internal/config"
	"wailshark/internal/core/domain"
	"wailshark/internal/utils/parser"

	"github.com/elazarl/goproxy"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type ProxyHandler struct {
	Port                        int             // Port on which the proxy server will listen
	Ctx                         context.Context // Context for the proxy operations
	DB                          *sqlite.DB
	InterceptEnabled            atomic.Bool
	PendingRequests             sync.Map // key: id (int64), value: chan InterceptAction
	PendingResponses            sync.Map // key: id (int64), value: chan InterceptAction
	RequestsToInterceptResponse sync.Map // key: id (int64), value: bool
	InterceptResponses          atomic.Bool
	Server                      *http.Server
	serverMu                    sync.Mutex
}

type InterceptAction struct {
	Type             string // "forward", "drop"
	ModifiedRequest  *domain.HTTPRequestDTO
	ModifiedResponse *domain.HTTPResponseDTO
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
	return &ProxyHandler{Port: port}
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
	p.Port = port
}

func (p *ProxyHandler) GetPort() int {
	return p.Port
}

func (p *ProxyHandler) SetDefaults() {
	if p.Port == 0 {
		p.Port = 8080 // Default port for the proxy server
	}
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
	p.Port = settings.ProxyPort

	// Create a new proxy instance
	proxy := goproxy.NewProxyHttpServer()

	certPath, _ := config.GetCertPath()
	keyPath, _ := config.GetKeyPath()
	if err := config.EnsureCA(); err != nil {
		log.Fatalf("Failed to ensure CA: %v", err)
	}

	cert, err := p.parseCA(certPath, keyPath)
	if err != nil {
		log.Fatalf("Failed to parse CA certificate: %v", err)
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
				// Block request
				actionChan := make(chan InterceptAction)
				p.PendingRequests.Store(id, actionChan)

				// Notify frontend
				p.SendToFrontend("interceptedRequest", id)

				// Wait for action
				// Wait for action
				var action InterceptAction
				select {
				case action = <-actionChan:
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
					shouldIntercept = val.(bool)
				}

				if shouldIntercept {
					// Clean up map if it was a one-time intercept
					p.RequestsToInterceptResponse.Delete(id)

					actionChan := make(chan InterceptAction)
					p.PendingResponses.Store(id, actionChan)

					p.SendToFrontend("interceptedResponse", id)

					log.Printf("Waiting for action for ID %d", id)
					var action InterceptAction
					select {
					case action = <-actionChan:
						log.Printf("Received action for ID %d: %s", id, action.Type)
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

	// Start proxy server on port specified in the handler
	bindAddr := fmt.Sprintf("%s:%d", settings.ProxyAddr, p.Port)
	log.Println("Starting HTTP proxy on", bindAddr)

	p.serverMu.Lock()
	p.Server = &http.Server{
		Addr:    bindAddr,
		Handler: proxy,
	}
	p.serverMu.Unlock()

	err = p.Server.ListenAndServe()
	if err != nil && err != http.ErrServerClosed {
		log.Printf("Proxy server error: %v", err)
	}
}

func (p *ProxyHandler) Restart() {
	p.serverMu.Lock()
	if p.Server != nil {
		p.Server.Close()
	}
	p.serverMu.Unlock()

	go p.Start()
}

func (p *ProxyHandler) SetIntercept(enabled bool) {
	p.InterceptEnabled.Store(enabled)
	p.SendToFrontend("interceptStatus", enabled)
	if !enabled {
		p.FlushPending()
	}
}

func (p *ProxyHandler) FlushPending() {
	log.Println("FlushPending called")
	p.PendingRequests.Range(func(key, value any) bool {
		if ch, ok := value.(chan InterceptAction); ok {
			// Non-blocking send to avoid deadlock if channel is somehow full (shouldn't be)
			select {
			case ch <- InterceptAction{Type: "forward"}:
			default:
			}
		}
		p.PendingRequests.Delete(key)
		return true
	})

	p.PendingResponses.Range(func(key, value any) bool {
		if ch, ok := value.(chan InterceptAction); ok {
			select {
			case ch <- InterceptAction{Type: "forward"}:
			default:
			}
		}
		p.PendingResponses.Delete(key)
		return true
	})
}

func (p *ProxyHandler) HandleRequestAction(id int64, actionType string, modifiedReq *domain.HTTPRequestDTO) {
	if val, ok := p.PendingRequests.Load(id); ok {
		if ch, ok := val.(chan InterceptAction); ok {
			if actionType == "forward_and_intercept" {
				p.RequestsToInterceptResponse.Store(id, true)
				// Change action type to forward for the proxy logic
				ch <- InterceptAction{Type: "forward", ModifiedRequest: modifiedReq}
			} else {
				ch <- InterceptAction{Type: actionType, ModifiedRequest: modifiedReq}
			}
		}
	}
}

func (p *ProxyHandler) HandleResponseAction(id int64, actionType string, modifiedResp *domain.HTTPResponseDTO) {
	log.Printf("HandleResponseAction called for ID %d with action %s", id, actionType)
	if val, ok := p.PendingResponses.Load(id); ok {
		if ch, ok := val.(chan InterceptAction); ok {
			ch <- InterceptAction{Type: actionType, ModifiedResponse: modifiedResp}
		}
	} else {
		log.Printf("Failed to find pending response channel for ID %d", id)
	}
}
