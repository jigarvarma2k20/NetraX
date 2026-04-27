package mcp

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/jigarvarma2k20/netrax/internal/core/domain"

	"github.com/mandolyte/mdtopdf"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

type MCPServer struct {
	srv     *server.MCPServer
	httpSrv *http.Server
	mu      sync.Mutex
	running bool
	port    int
	address string

	// App context references to interact with requests
	getRequests             func(limit, offset int) ([]domain.HTTPTransactionDTO, error)
	getRequest              func(id int64) (*domain.HTTPTransactionDTO, error)
	executeRequest          func(req domain.HTTPRequestDTO) (*domain.HTTPTransactionDTO, error)
	setIntercept            func(enabled bool)
	forwardRequest          func(id int64, modifiedReq domain.HTTPRequestDTO)
	getInterceptedRequests  func() ([]domain.HTTPTransactionDTO, error)
	dropRequest             func(id int64)
	getInterceptedResponses func() ([]domain.HTTPTransactionDTO, error)
	forwardResponse         func(id int64, modifiedResp domain.HTTPResponseDTO)
	dropResponse            func(id int64)
	forwardAndInterceptRes  func(id int64, modifiedReq domain.HTTPRequestDTO)
	forwardAll              func()
	getProxySettings        func() string
	getProxyCAInfo          func() string
}

func NewMCPServer(
	getRequests func(limit, offset int) ([]domain.HTTPTransactionDTO, error),
	getRequest func(id int64) (*domain.HTTPTransactionDTO, error),
	executeRequest func(req domain.HTTPRequestDTO) (*domain.HTTPTransactionDTO, error),
	setIntercept func(enabled bool),
	forwardRequest func(id int64, modifiedReq domain.HTTPRequestDTO),
	getInterceptedRequests func() ([]domain.HTTPTransactionDTO, error),
	dropRequest func(id int64),
	getInterceptedResponses func() ([]domain.HTTPTransactionDTO, error),
	forwardResponse func(id int64, modifiedResp domain.HTTPResponseDTO),
	dropResponse func(id int64),
	forwardAndInterceptRes func(id int64, modifiedReq domain.HTTPRequestDTO),
	forwardAll func(),
	getProxySettings func() string,
	getProxyCAInfo func() string,
) *MCPServer {
	m := &MCPServer{
		port:                    8085,        // Default MCP SSE port
		address:                 "127.0.0.1", // Default MCP Address
		getRequests:             getRequests,
		getRequest:              getRequest,
		executeRequest:          executeRequest,
		setIntercept:            setIntercept,
		forwardRequest:          forwardRequest,
		getInterceptedRequests:  getInterceptedRequests,
		dropRequest:             dropRequest,
		getInterceptedResponses: getInterceptedResponses,
		forwardResponse:         forwardResponse,
		dropResponse:            dropResponse,
		forwardAndInterceptRes:  forwardAndInterceptRes,
		forwardAll:              forwardAll,
		getProxySettings:        getProxySettings,
		getProxyCAInfo:          getProxyCAInfo,
	}
	m.initServer()
	return m
}

func (m *MCPServer) initServer() {
	m.srv = server.NewMCPServer(
		"NetraX",
		"1.0.0",
		server.WithToolCapabilities(true),
		server.WithResourceCapabilities(true, true),
	)

	// Add basic tools
	m.srv.AddTool(mcp.NewTool("get_recent_traffic",
		mcp.WithDescription("Fetch the most recent HTTP transactions captured by NetraX"),
		mcp.WithNumber("limit", mcp.Description("Number of requests to fetch (max 50)"), mcp.DefaultNumber(10)),
	), m.handleGetTraffic)

	m.srv.AddTool(mcp.NewTool("get_request",
		mcp.WithDescription("Fetch detailed info for a specific request ID (including body and headers)"),
		mcp.WithNumber("id", mcp.Description("The Request ID/Index (required)"), mcp.Required()),
	), m.handleGetRequest)

	m.srv.AddTool(mcp.NewTool("execute_request",
		mcp.WithDescription("Send a customized HTTP request (like the Repeater) and return its response"),
		mcp.WithString("method", mcp.Description("HTTP Method (e.g. GET, POST)"), mcp.Required()),
		mcp.WithString("url", mcp.Description("Target URL"), mcp.Required()),
		mcp.WithString("protocol", mcp.Description("HTTP Protocol (e.g. HTTP/1.1)"), mcp.DefaultString("HTTP/1.1")),
		mcp.WithString("headers", mcp.Description("JSON encoded string of map[string][]string for headers"), mcp.DefaultString("{}")),
		mcp.WithString("body", mcp.Description("Body of the request"), mcp.DefaultString("")),
	), m.handleExecuteRequest)

	m.srv.AddTool(mcp.NewTool("set_intercept",
		mcp.WithDescription("Enable or disable interception of traffic"),
		mcp.WithBoolean("enabled", mcp.Description("True to start intercepting traffic, false to stop"), mcp.Required()),
	), m.handleSetIntercept)

	m.srv.AddTool(mcp.NewTool("forward_request",
		mcp.WithDescription("Forward a currently intercepted HTTP request, optionally with a modified body/headers"),
		mcp.WithNumber("id", mcp.Description("The Request ID of the intercepted transaction"), mcp.Required()),
		mcp.WithString("method", mcp.Description("HTTP Method"), mcp.Required()),
		mcp.WithString("url", mcp.Description("URL"), mcp.Required()),
		mcp.WithString("headers", mcp.Description("JSON encoded string of map[string][]string for headers"), mcp.DefaultString("{}")),
		mcp.WithString("body", mcp.Description("Body of the request"), mcp.DefaultString("")),
	), m.handleForwardRequest)

	m.srv.AddTool(mcp.NewTool("get_intercepted_requests",
		mcp.WithDescription("List all HTTP requests that are currently intercepted and waiting for action. Use these IDs to forward them."),
	), m.handleGetInterceptedRequests)

	m.srv.AddTool(mcp.NewTool("drop_request",
		mcp.WithDescription("Drop a currently intercepted HTTP request, preventing it from reaching the server"),
		mcp.WithNumber("id", mcp.Description("The Request ID of the intercepted transaction"), mcp.Required()),
	), m.handleDropRequest)

	m.srv.AddTool(mcp.NewTool("get_intercepted_responses",
		mcp.WithDescription("List all HTTP responses that are currently intercepted and waiting for action."),
	), m.handleGetInterceptedResponses)

	m.srv.AddTool(mcp.NewTool("forward_response",
		mcp.WithDescription("Forward a currently intercepted HTTP response, optionally with modified status, headers, or body"),
		mcp.WithNumber("id", mcp.Description("The Request ID/Index of the intercepted transaction"), mcp.Required()),
		mcp.WithNumber("status_code", mcp.Description("HTTP Status Code (e.g. 200, 404)"), mcp.Required()),
		mcp.WithString("headers", mcp.Description("JSON encoded string of map[string][]string for headers"), mcp.DefaultString("{}")),
		mcp.WithString("body", mcp.Description("Body of the response"), mcp.DefaultString("")),
	), m.handleForwardResponse)

	m.srv.AddTool(mcp.NewTool("drop_response",
		mcp.WithDescription("Drop a currently intercepted HTTP response"),
		mcp.WithNumber("id", mcp.Description("The Request ID/Index of the intercepted transaction"), mcp.Required()),
	), m.handleDropResponse)

	m.srv.AddTool(mcp.NewTool("forward_and_intercept_response",
		mcp.WithDescription("Forward a currently intercepted HTTP request, and automatically intercept its response"),
		mcp.WithNumber("id", mcp.Description("The Request ID of the intercepted transaction"), mcp.Required()),
		mcp.WithString("method", mcp.Description("HTTP Method"), mcp.Required()),
		mcp.WithString("url", mcp.Description("URL"), mcp.Required()),
		mcp.WithString("headers", mcp.Description("JSON encoded string of map[string][]string for headers"), mcp.DefaultString("{}")),
		mcp.WithString("body", mcp.Description("Body of the request"), mcp.DefaultString("")),
	), m.handleForwardAndInterceptResponse)

	m.srv.AddTool(mcp.NewTool("forward_all",
		mcp.WithDescription("Unblock/forward all currently intercepted requests and responses at once."),
	), m.handleForwardAll)

	m.srv.AddTool(mcp.NewTool("get_proxy_settings",
		mcp.WithDescription("Fetch current NetraX Proxy Configuration (Ports, Bindings, System IP interface, etc)."),
	), m.handleGetProxySettings)

	m.srv.AddTool(mcp.NewTool("get_proxy_ca_info",
		mcp.WithDescription("Fetch information regarding the NetraX CA Certificate used for HTTPS interception (Existence, Path, Common Name)."),
	), m.handleGetProxyCAInfo)

	m.srv.AddTool(mcp.NewTool("execute_cmd",
		mcp.WithDescription("Execute a shell command. Handle with care."),
		mcp.WithString("command", mcp.Description("The shell command string to execute (e.g. ls -la)"), mcp.Required()),
	), m.handleExecuteCmd)

	m.srv.AddTool(mcp.NewTool("export_report_pdf",
		mcp.WithDescription("Exports a text report or markdown content to a PDF file on disk."),
		mcp.WithString("content", mcp.Description("The text or markdown content to export to PDF"), mcp.Required()),
		mcp.WithString("filename", mcp.Description("Optional filename (e.g. report.pdf). If empty, NetraXReport.pdf is used."), mcp.DefaultString("NetraXReport.pdf")),
	), m.handleExportReportPdf)
}

func (m *MCPServer) Start(address string, port int) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.running {
		return fmt.Errorf("MCP server is already running on %s:%d", m.address, m.port)
	}

	if address == "" {
		address = "127.0.0.1"
	}

	m.address = address
	m.port = port

	sseServer := server.NewSSEServer(m.srv)

	mux := http.NewServeMux()
	mux.Handle("/sse", sseServer.SSEHandler())
	mux.Handle("/message", sseServer.MessageHandler())

	listener, err := net.Listen("tcp", fmt.Sprintf("%s:%d", m.address, m.port))
	if err != nil {
		return fmt.Errorf("failed to bind address: %w", err)
	}

	m.httpSrv = &http.Server{
		Handler: mux,
	}

	go func() {
		log.Printf("Starting NetraX MCP SSE server on http://%s:%d", m.address, m.port)
		if err := m.httpSrv.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("MCP Server error: %v", err)
			m.mu.Lock()
			m.running = false
			m.mu.Unlock()
		}
	}()

	m.running = true
	return nil
}

func (m *MCPServer) Stop() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.running || m.httpSrv == nil {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := m.httpSrv.Shutdown(ctx); err != nil {
		return fmt.Errorf("MCP Server shutdown failed: %w", err)
	}

	m.running = false
	m.httpSrv = nil
	log.Println("NetraX MCP Server stopped")
	return nil
}

func (m *MCPServer) IsRunning() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.running
}

func (m *MCPServer) GetServer() *server.MCPServer {
	return m.srv
}

func (m *MCPServer) handleGetTraffic(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	limit := 10
	args, ok := request.Params.Arguments.(map[string]interface{})
	if ok {
		if l, ok := args["limit"].(float64); ok {
			limit = int(l)
		}
	}

	if limit > 50 {
		limit = 50
	}

	requests, err := m.getRequests(limit, 0)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to fetch requests: %v", err)), nil
	}

	var result string
	for _, req := range requests {
		result += fmt.Sprintf("ID: %d | [%s] %s | Status: %v\n", req.Index, req.Request.Method, req.Request.URL, req.Response.Status)
	}

	if result == "" {
		result = "No traffic recorded yet."
	}

	return mcp.NewToolResultText(result), nil
}

func (m *MCPServer) handleGetRequest(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args, ok := request.Params.Arguments.(map[string]interface{})
	if !ok {
		return mcp.NewToolResultError("Invalid arguments format"), nil
	}

	idFloat, ok := args["id"].(float64)
	if !ok {
		return mcp.NewToolResultError("Missing or invalid id parameter"), nil
	}

	req, err := m.getRequest(int64(idFloat))
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to get request %d: %v", int64(idFloat), err)), nil
	}

	if req == nil {
		return mcp.NewToolResultError("Request not found"), nil
	}

	result := fmt.Sprintf("Request: [%s] %s\nHeaders: %s\nBody: %s\n\nResponse: %s %v\nHeaders: %s\nBody: %s",
		req.Request.Method, req.Request.URL, req.Request.Header, req.Request.Body,
		req.Response.Status, req.Response.StatusCode, req.Response.Header, req.Response.Body)

	return mcp.NewToolResultText(result), nil
}

func (m *MCPServer) handleExecuteRequest(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args, ok := request.Params.Arguments.(map[string]interface{})
	if !ok {
		return mcp.NewToolResultError("Invalid arguments format"), nil
	}

	method, _ := args["method"].(string)
	url, _ := args["url"].(string)
	protocol, _ := args["protocol"].(string)
	headers, _ := args["headers"].(string)
	body, _ := args["body"].(string)

	if method == "" || url == "" {
		return mcp.NewToolResultError("method and url evaluate to empty strings"), nil
	}

	reqDTO := domain.HTTPRequestDTO{
		Method: method,
		URL:    url,
		Proto:  protocol,
		Header: headers,
		Body:   body,
	}

	res, err := m.executeRequest(reqDTO)
	if err != nil {
		return mcp.NewToolResultText(fmt.Sprintf("Failed to execute request: %v", err)), nil
	}

	result := fmt.Sprintf("Response: %s\nHeaders: %s\nBody: %s", res.Response.Status, res.Response.Header, res.Response.Body)
	return mcp.NewToolResultText(result), nil
}

func (m *MCPServer) handleSetIntercept(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args, ok := request.Params.Arguments.(map[string]interface{})
	if !ok {
		return mcp.NewToolResultError("Invalid arguments format"), nil
	}

	enabled, ok := args["enabled"].(bool)
	if !ok {
		return mcp.NewToolResultError("Missing or invalid enabled parameter"), nil
	}

	m.setIntercept(enabled)

	state := "disabled"
	if enabled {
		state = "enabled"
	}

	return mcp.NewToolResultText(fmt.Sprintf("Interception %s successfully.", state)), nil
}

func (m *MCPServer) handleForwardRequest(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args, ok := request.Params.Arguments.(map[string]interface{})
	if !ok {
		return mcp.NewToolResultError("Invalid arguments format"), nil
	}

	idFloat, ok := args["id"].(float64)
	if !ok {
		return mcp.NewToolResultError("Missing or invalid id parameter"), nil
	}

	method, _ := args["method"].(string)
	url, _ := args["url"].(string)
	headers, _ := args["headers"].(string)
	body, _ := args["body"].(string)

	reqDTO := domain.HTTPRequestDTO{
		Method: method,
		URL:    url,
		Header: headers,
		Body:   body,
	}

	m.forwardRequest(int64(idFloat), reqDTO)
	return mcp.NewToolResultText("Request forwarded successfully."), nil
}

func (m *MCPServer) handleGetInterceptedRequests(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	requests, err := m.getInterceptedRequests()
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to fetch pending requests: %v", err)), nil
	}

	if len(requests) == 0 {
		return mcp.NewToolResultText("No intercepted requests currently waiting."), nil
	}

	var result string
	for _, req := range requests {
		result += fmt.Sprintf("ID: %v\nMethod: %s\nURL: %s\nHeaders: %s\nBody (preview): %s...\n\n",
			req.Index, req.Request.Method, req.Request.URL, req.Request.Header,
			truncate(req.Request.Body, 100))
	}

	return mcp.NewToolResultText(result), nil
}

func truncate(s string, length int) string {
	if len(s) <= length {
		return s
	}
	return s[:length]
}

func (m *MCPServer) handleDropRequest(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args, ok := request.Params.Arguments.(map[string]interface{})
	if !ok {
		return mcp.NewToolResultError("Invalid arguments format"), nil
	}

	idFloat, ok := args["id"].(float64)
	if !ok {
		return mcp.NewToolResultError("Missing or invalid id parameter"), nil
	}

	m.dropRequest(int64(idFloat))
	return mcp.NewToolResultText("Request dropped successfully."), nil
}

func (m *MCPServer) handleGetInterceptedResponses(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	requests, err := m.getInterceptedResponses()
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to fetch pending responses: %v", err)), nil
	}

	if len(requests) == 0 {
		return mcp.NewToolResultText("No intercepted responses currently waiting."), nil
	}

	var result string
	for _, req := range requests {
		result += fmt.Sprintf("ID: %v\nStatus: %d\nURL: %s\nHeaders: %s\nBody (preview): %s...\n\n",
			req.Index, req.Response.StatusCode, req.Request.URL, req.Response.Header,
			truncate(req.Response.Body, 100))
	}

	return mcp.NewToolResultText(result), nil
}

func (m *MCPServer) handleForwardResponse(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args, ok := request.Params.Arguments.(map[string]interface{})
	if !ok {
		return mcp.NewToolResultError("Invalid arguments format"), nil
	}

	idFloat, ok := args["id"].(float64)
	if !ok {
		return mcp.NewToolResultError("Missing or invalid id parameter"), nil
	}

	statusFloat, ok := args["status_code"].(float64)
	if !ok {
		return mcp.NewToolResultError("Missing or invalid status_code parameter"), nil
	}

	headers, _ := args["headers"].(string)
	body, _ := args["body"].(string)

	respDTO := domain.HTTPResponseDTO{
		StatusCode: int(statusFloat),
		Header:     headers,
		Body:       body,
	}

	m.forwardResponse(int64(idFloat), respDTO)
	return mcp.NewToolResultText("Response forwarded successfully."), nil
}

func (m *MCPServer) handleDropResponse(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args, ok := request.Params.Arguments.(map[string]interface{})
	if !ok {
		return mcp.NewToolResultError("Invalid arguments format"), nil
	}

	idFloat, ok := args["id"].(float64)
	if !ok {
		return mcp.NewToolResultError("Missing or invalid id parameter"), nil
	}

	m.dropResponse(int64(idFloat))
	return mcp.NewToolResultText("Response dropped successfully."), nil
}

func (m *MCPServer) handleForwardAndInterceptResponse(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args, ok := request.Params.Arguments.(map[string]interface{})
	if !ok {
		return mcp.NewToolResultError("Invalid arguments format"), nil
	}

	idFloat, ok := args["id"].(float64)
	if !ok {
		return mcp.NewToolResultError("Missing or invalid id parameter"), nil
	}

	method, _ := args["method"].(string)
	url, _ := args["url"].(string)
	headers, _ := args["headers"].(string)
	body, _ := args["body"].(string)

	reqDTO := domain.HTTPRequestDTO{
		Method: method,
		URL:    url,
		Header: headers,
		Body:   body,
	}

	m.forwardAndInterceptRes(int64(idFloat), reqDTO)
	return mcp.NewToolResultText("Request forwarded successfully, and its response will be intercepted."), nil
}

func (m *MCPServer) handleForwardAll(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	m.forwardAll()
	return mcp.NewToolResultText("All intercepted traffic has been forwarded successfully."), nil
}

func (m *MCPServer) handleGetProxySettings(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	settingsJson := m.getProxySettings()
	return mcp.NewToolResultText(settingsJson), nil
}

func (m *MCPServer) handleGetProxyCAInfo(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	caInfoJson := m.getProxyCAInfo()
	return mcp.NewToolResultText(caInfoJson), nil
}

func (m *MCPServer) handleExecuteCmd(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args, ok := request.Params.Arguments.(map[string]interface{})
	if !ok {
		return mcp.NewToolResultError("Invalid arguments format"), nil
	}

	cmdStr, ok := args["command"].(string)
	if !ok || cmdStr == "" {
		return mcp.NewToolResultError("Missing command string"), nil
	}

	cmd := exec.CommandContext(ctx, "sh", "-c", cmdStr)
	var outb, errb bytes.Buffer
	cmd.Stdout = &outb
	cmd.Stderr = &errb

	err := cmd.Run()
	output := outb.String()
	if err != nil {
		output += fmt.Sprintf("\nError: %v\nStderr: %s", err, errb.String())
		return mcp.NewToolResultError(output), nil
	}

	return mcp.NewToolResultText(output), nil
}

func sanitizeForPDF(content string) string {
	replacements := map[string]string{
		"—": "-",
		"–": "-",
		"‑": "-", // Non-breaking hyphen
		"“": `"`,
		"”": `"`,
		"‘": "'",
		"’": "'",
		"…": "...",
		" ": " ", // Non-breaking space
		" ": " ", // Narrow no-break space (U+202F)
	}
	for k, v := range replacements {
		content = strings.ReplaceAll(content, k, v)
	}
	return content
}

func (m *MCPServer) handleExportReportPdf(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args, ok := request.Params.Arguments.(map[string]interface{})
	if !ok {
		return mcp.NewToolResultError("Invalid arguments format"), nil
	}

	content, ok := args["content"].(string)
	if !ok {
		return mcp.NewToolResultError("Missing content string"), nil
	}

	content = sanitizeForPDF(content)

	filename, _ := args["filename"].(string)
	if filename == "" {
		filename = "NetraXReport.pdf"
	}
	if filepath.Ext(filename) != ".pdf" {
		filename += ".pdf"
	}

	pf := mdtopdf.NewPdfRenderer("", "", filename, "", nil, mdtopdf.LIGHT)
	err := pf.Process([]byte(content))
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("Failed to write PDF: %v", err)), nil
	}

	absPath, err := filepath.Abs(filename)
	if err != nil {
		absPath = filename // fallback
	}

	return mcp.NewToolResultText(fmt.Sprintf("PDF exported successfully to %s", absPath)), nil
}
