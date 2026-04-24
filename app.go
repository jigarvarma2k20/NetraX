package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jigarvarma2k20/netrax/internal/adapters/persistence/sqlite"
	"github.com/jigarvarma2k20/netrax/internal/adapters/proxy"
	"github.com/jigarvarma2k20/netrax/internal/config"
	"github.com/jigarvarma2k20/netrax/internal/core/domain"
	"github.com/jigarvarma2k20/netrax/internal/core/ports"
	"github.com/jigarvarma2k20/netrax/internal/mcp"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx              context.Context
	Proxy            *proxy.ProxyHandler
	DB               *sqlite.DB
	MCPServer        *mcp.MCPServer
	autonomousCancel context.CancelFunc
	chatCancel       context.CancelFunc
}

// NewApp creates a new App application struct
func NewApp() *App {
	db, err := sqlite.InitDB("./netrax.db")
	if err != nil {
		panic(err)
	}
	appInstance := &App{
		Proxy: proxy.NewProxyHandler(db),
		DB:    db,
	}

	appInstance.MCPServer = mcp.NewMCPServer(
		func(limit, offset int) ([]domain.HTTPTransactionDTO, error) {
			return appInstance.GetRequests(limit, offset)
		},
		func(id int64) (*domain.HTTPTransactionDTO, error) {
			return appInstance.GetRequestByID(id, false)
		},
		func(req domain.HTTPRequestDTO) (*domain.HTTPTransactionDTO, error) {
			return appInstance.ExecuteRequest(req)
		},
		func(enabled bool) {
			appInstance.SetIntercept(enabled)
		},
		func(id int64, modifiedReq domain.HTTPRequestDTO) {
			appInstance.ForwardRequest(id, modifiedReq)
		},
		func() ([]domain.HTTPTransactionDTO, error) {
			return appInstance.GetInterceptedRequests()
		},
		func(id int64) {
			appInstance.DropRequest(id)
		},
		func() ([]domain.HTTPTransactionDTO, error) {
			return appInstance.GetInterceptedResponses()
		},
		func(id int64, modifiedResp domain.HTTPResponseDTO) {
			appInstance.ForwardResponse(id, modifiedResp)
		},
		func(id int64) {
			appInstance.DropResponse(id)
		},
		func(id int64, modifiedReq domain.HTTPRequestDTO) {
			appInstance.ForwardAndInterceptResponse(id, modifiedReq)
		},
		func() {
			appInstance.ForwardAll()
		},
		func() string {
			settings := appInstance.GetSettings()
			bytes, _ := json.MarshalIndent(settings, "", "  ")
			return string(bytes)
		},
		func() string {
			caInfo := appInstance.GetCAInfo()
			bytes, _ := json.MarshalIndent(caInfo, "", "  ")
			return string(bytes)
		},
	)

	return appInstance
}

// startup is called when the app starts.
// The context is saved so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Start the proxy in a separate goroutine
	go func() {
		a.Proxy.SetContext(ctx) // so we can execute runtime methods from the proxy
		a.Proxy.Start()
	}()

}

func (a *App) GetRequestByID(id int64, withoutBody bool) (*domain.HTTPTransactionDTO, error) {
	if withoutBody {
		return a.DB.GetRequestByIDWithoutBody(id)
	}
	return a.DB.GetRequestByID(id)
}

func (a *App) QuitApp() {
	runtime.Quit(a.ctx)
}

func (a *App) CancelAgentChat() {
	if a.chatCancel != nil {
		a.chatCancel()
	}
}

func (a *App) SetIntercept(enabled bool) {
	a.Proxy.SetIntercept(enabled)
}

func (a *App) GetRequests(limit, offset int) ([]domain.HTTPTransactionDTO, error) {
	reqs, err := a.DB.GetRequests(limit, offset)
	log.Printf("App.GetRequests called: limit=%d, offset=%d. Returning %d requests, err: %v", limit, offset, len(reqs), err)
	return reqs, err
}

func (a *App) StartMCPServer(address string, port int) error {
	return a.MCPServer.Start(address, port)
}

func (a *App) StopMCPServer() error {
	return a.MCPServer.Stop()
}

func (a *App) GetMCPStatus() bool {
	return a.MCPServer.IsRunning()
}

func (a *App) ForwardRequest(id int64, modifiedReq domain.HTTPRequestDTO) {
	a.Proxy.HandleRequestAction(id, "forward", &modifiedReq)
}

func (a *App) DropRequest(id int64) {
	a.Proxy.HandleRequestAction(id, "drop", nil)
}

func (a *App) ForwardAndInterceptResponse(id int64, modifiedReq domain.HTTPRequestDTO) {
	a.Proxy.HandleRequestAction(id, "forward_and_intercept", &modifiedReq)
}

func (a *App) ForwardResponse(id int64, modifiedResp domain.HTTPResponseDTO) {
	a.Proxy.HandleResponseAction(id, "forward", &modifiedResp)
}

func (a *App) DropResponse(id int64) {
	a.Proxy.HandleResponseAction(id, "drop", nil)
}

// ExecuteRequest is used by the Repeater feature to send a custom request
func (a *App) ExecuteRequest(req domain.HTTPRequestDTO) (*domain.HTTPTransactionDTO, error) {
	// Create new HTTP request with timeout
	client := &http.Client{
		Timeout: 30 * time.Second,
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
	var headers map[string][]string
	if req.Header != "" {
		_ = json.Unmarshal([]byte(req.Header), &headers)
		for k, vList := range headers {
			for _, v := range vList {
				httpReq.Header.Add(k, v)
			}
		}
	}

	// Perform Request
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// Convert Response to DTO
	respDTO := domain.ToHTTPResponseDTO(resp)

	// Return a standalone transaction object (not saved to DB unless user wants?)
	// Let's not save to DB for Repeater unless explicitly saved.

	return &domain.HTTPTransactionDTO{
		Request:  req,
		Response: respDTO,
		Index:    0, // 0 indicates not in history
	}, nil
}

func (a *App) ForwardAll() {
	a.Proxy.FlushPending()
}

// ExportProject saves the current database to a file selected by the user
func (a *App) ExportProject() error {
	filepath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultFilename: "traffic.nxp",
		Title:           "Export Project",
		Filters: []runtime.FileFilter{
			{DisplayName: "NetraX Project", Pattern: "*.nxp"},
		},
	})
	if err != nil || filepath == "" {
		return err
	}

	// Simple file copy
	sourceFile, err := os.Open("./netrax.db")
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}

// ImportProject loads a database file selected by the user
func (a *App) ImportProject() error {
	filepath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open Project",
		Filters: []runtime.FileFilter{
			{DisplayName: "NetraX Project", Pattern: "*.nxp"},
		},
	})
	if err != nil || filepath == "" {
		return err
	}

	// Close current DB connection
	a.DB.Close()

	// Copy selected file to working DB
	sourceFile, err := os.Open(filepath)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	// Remove existing (though we closed it, overwriting is safer with create)
	os.Remove("./netrax.db")

	destFile, err := os.Create("./netrax.db")
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	if err != nil {
		return err
	}

	// Re-initialize DB
	newDB, err := sqlite.InitDB("./netrax.db")
	if err != nil {
		return err
	}
	a.DB = newDB
	a.Proxy.SetDB(newDB)
	return nil
}

// Repeater Wrappers

func (a *App) SaveRepeater(name, method, url, proto, header, body string) (int64, error) {
	return a.DB.SaveRepeater(name, method, url, proto, header, body)
}

func (a *App) UpdateRepeater(id int64, name, method, url, proto, header, body string) error {
	return a.DB.UpdateRepeater(id, name, method, url, proto, header, body)
}

func (a *App) DeleteRepeater(id int64) error {
	return a.DB.DeleteRepeater(id)
}

func (a *App) GetRepeaters() ([]sqlite.RepeaterRequest, error) {
	return a.DB.GetRepeaters()
}

// GetSettings retrieves current application settings
func (a *App) GetSettings() config.Settings {
	return config.LoadSettings()
}

// SaveSettings saves the application settings and restarts the proxy if needed
func (a *App) SaveSettings(settings config.Settings) error {
	err := config.SaveSettings(settings)
	if err != nil {
		return err
	}
	a.Proxy.Restart()
	return nil
}

func (a *App) CheckProxyBindingsAvailability(bindings []ports.ProxyBinding) []ports.BindingAvailability {
	activeBindings := a.Proxy.GetBindings()
	return ports.CheckAvailabilityWithActive(bindings, activeBindings)
}

type CAInfo struct {
	Exists   bool   `json:"exists"`
	Path     string `json:"path"`
	ErrorMsg string `json:"errorMsg"`
}

// GetCAInfo returns information about the current CA
func (a *App) GetCAInfo() CAInfo {
	certPath, _ := config.GetCertPath()
	info := CAInfo{Path: certPath}

	if _, err := os.Stat(certPath); err == nil {
		info.Exists = true
	} else {
		info.ErrorMsg = err.Error()
	}
	return info
}

// RegenerateCA generates a new CA cert/key pair and restarts the proxy
func (a *App) RegenerateCA(commonName string) error {
	err := config.GenerateCA(commonName)
	if err != nil {
		return err
	}
	a.Proxy.Restart()
	return nil
}

// ExportCACertificate prompts the user to save the public CA certificate
func (a *App) ExportCACertificate() error {
	certPath, err := config.GetCertPath()
	if err != nil {
		return err
	}

	content, err := os.ReadFile(certPath)
	if err != nil {
		return fmt.Errorf("could not read certificate: %w", err)
	}

	filepath, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultFilename: "netraxCA.crt",
		Title:           "Export NetraX CA Certificate",
		Filters: []runtime.FileFilter{
			{DisplayName: "Certificate Files (*.crt)", Pattern: "*.crt"},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	})

	if err != nil {
		return err
	}

	if filepath == "" {
		return nil // User cancelled
	}

	return os.WriteFile(filepath, content, 0644)
}

// ResetProject clears the database
func (a *App) ResetProject() {
	a.DB.Close()
	os.Remove("./netrax.db")
	newDB, err := sqlite.InitDB("./netrax.db")
	if err != nil {
		log.Println("Error resetting DB:", err)
		return
	}
	a.DB = newDB
	a.Proxy.SetDB(newDB)
}

func (a *App) GetInterceptedRequests() ([]domain.HTTPTransactionDTO, error) {
	ids := a.Proxy.GetPendingRequests()
	var reqs []domain.HTTPTransactionDTO
	for _, id := range ids {
		req, err := a.DB.GetRequestByID(id)
		if err == nil && req != nil {
			reqs = append(reqs, *req)
		}
	}
	return reqs, nil
}

func (a *App) GetInterceptedResponses() ([]domain.HTTPTransactionDTO, error) {
	ids := a.Proxy.GetPendingResponses()
	var reqs []domain.HTTPTransactionDTO
	for _, id := range ids {
		req, err := a.DB.GetRequestByID(id)
		if err == nil && req != nil {
			reqs = append(reqs, *req)
		}
	}
	return reqs, nil
}
