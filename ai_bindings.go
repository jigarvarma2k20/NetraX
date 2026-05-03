// This file is part of NetraX.
// Repository: https://github.com/jigarvarma2k20/NetraX
//
// Copyright (c) 2026 NetraX Contributors
//
// SPDX-License-Identifier: GPL-3.0

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type AIModelConfig struct {
	APIKey  string `json:"apiKey"`
	BaseURL string `json:"baseUrl"`
	Model   string `json:"model"`
}

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type agentMessage struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	Name       string     `json:"name,omitempty"`
	ToolCalls  []toolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

type toolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type llmFunction struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Parameters  json.RawMessage `json:"parameters,omitempty"`
}

type llmTool struct {
	Type     string      `json:"type"`
	Function llmFunction `json:"function"`
}

type llmRequest struct {
	Model    string         `json:"model"`
	Messages []agentMessage `json:"messages"`
	Tools    []llmTool      `json:"tools,omitempty"`
}

type llmResponse struct {
	Choices []struct {
		Message agentMessage `json:"message"`
	} `json:"choices"`
	Error interface{} `json:"error,omitempty"`
}

func (a *App) GetAgentHistory() ([]ChatMessage, error) {
	msgs, err := a.DB.GetAgentHistory()
	if err != nil {
		return nil, err
	}
	var res []ChatMessage
	for _, m := range msgs {
		res = append(res, ChatMessage{Role: m.Role, Content: m.Content})
	}
	return res, nil
}

func (a *App) ClearAgentHistory() error {
	return a.DB.ClearAgentHistory()
}

// CORE LLM EXECUTION HELPERS
func (a *App) invokeLLM(ctx context.Context, config AIModelConfig, msgs []agentMessage, tools []llmTool) (*llmResponse, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	reqBody := llmRequest{
		Model:    config.Model,
		Messages: msgs,
		Tools:    tools,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %v", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", config.BaseURL+"/chat/completions", bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %v", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	if config.APIKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+config.APIKey)
	}

	httpClient := &http.Client{Timeout: 45 * time.Second}
	resp, err := httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("AI request failed: %v", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var completionResp llmResponse
	if err := json.Unmarshal(respBody, &completionResp); err != nil {
		return nil, fmt.Errorf("failed to parse response %v. Body was: %s", err, string(respBody))
	}

	return &completionResp, nil
}

func (a *App) getAgentTools() []llmTool {
	var tools []llmTool
	for name, mcpTool := range a.MCPServer.GetServer().ListTools() {
		b, _ := json.Marshal(mcpTool.Tool.InputSchema)
		tools = append(tools, llmTool{
			Type: "function",
			Function: llmFunction{
				Name:        name,
				Description: mcpTool.Tool.Description,
				Parameters:  b,
			},
		})
	}

	tools = append(tools, llmTool{
		Type: "function",
		Function: llmFunction{
			Name:        "start_autopilot",
			Description: "Starts an autonomous background polling loop that will execute a specific instruction continuously. This enables the agent to evaluate and intercept traffic even when the user is inactive.",
			Parameters:  json.RawMessage(`{"type":"object","properties":{"instruction":{"type":"string","description":"The exact rule you will execute on requests inside the loop."},"url_regex":{"type":"string","description":"Optional. A regular expression to match specific target domains or URLs. Setting this filters out all unmatched traffic locally drastically improving proxy latency."}},"required":["instruction"]}`),
		},
	})

	tools = append(tools, llmTool{
		Type: "function",
		Function: llmFunction{
			Name:        "stop_autopilot",
			Description: "Stops the background autonomous agent loop.",
		},
	})
	return tools
}

func (a *App) processToolCalls(config AIModelConfig, msg agentMessage) []agentMessage {
	var toolsResponses []agentMessage

	for _, tc := range msg.ToolCalls {
		var resultStr string

		if tc.Function.Name == "start_autopilot" {
			runtime.EventsEmit(a.ctx, "agent_log", "Tool Call: start_autopilot")
			var args struct {
				Instruction string `json:"instruction"`
				URLRegex    string `json:"url_regex"`
			}
			json.Unmarshal([]byte(tc.Function.Arguments), &args)
			a.StartAutonomousAgent(config, args.Instruction, args.URLRegex)
			resultStr = "Started AutoPilot loop successfully."
		} else if tc.Function.Name == "stop_autopilot" {
			runtime.EventsEmit(a.ctx, "agent_log", "Tool Call: stop_autopilot")
			a.StopAutonomousAgent()
			resultStr = "Stopped AutoPilot loop successfully."
		} else {
			mcpTool := a.MCPServer.GetServer().GetTool(tc.Function.Name)
			if mcpTool != nil && mcpTool.Handler != nil {
				runtime.EventsEmit(a.ctx, "agent_log", fmt.Sprintf("Tool Call: %s", tc.Function.Name))
				var args map[string]interface{}
				if tc.Function.Arguments != "" {
					json.Unmarshal([]byte(tc.Function.Arguments), &args)
				}

				req := mcp.CallToolRequest{}
				req.Params.Name = tc.Function.Name
				req.Params.Arguments = args

				res, err := mcpTool.Handler(context.Background(), req)
				if err != nil {
					resultStr = fmt.Sprintf("Error: %v", err)
				} else if res.IsError {
					b, _ := json.Marshal(res.Content)
					resultStr = fmt.Sprintf("Tool Error: %s", string(b))
				} else {
					var textResponses []string
					for _, c := range res.Content {
						if txtContent, ok := c.(mcp.TextContent); ok {
							textResponses = append(textResponses, txtContent.Text)
						} else {
							b, _ := json.Marshal(c)
							textResponses = append(textResponses, string(b))
						}
					}
					resultStr = strings.Join(textResponses, "\n")
				}
			} else {
				resultStr = "Unknown function"
			}
		}

		toolsResponses = append(toolsResponses, agentMessage{
			Role:       "tool",
			Content:    resultStr,
			Name:       tc.Function.Name,
			ToolCallID: tc.ID,
		})
	}
	return toolsResponses
}

func (a *App) AgentChat(config AIModelConfig, history []ChatMessage, userMsg string) (newHistory []ChatMessage, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("critical error recovered: %v", r)
			fmt.Println("Panic recovering in AgentChat:", r)
		}
	}()

	ctx, cancel := context.WithCancel(context.Background())
	a.chatCancel = cancel
	defer func() {
		a.chatCancel = nil
		cancel()
	}()

	if config.BaseURL == "" {
		config.BaseURL = "https://api.openai.com/v1"
	}
	config.BaseURL = strings.TrimSuffix(config.BaseURL, "/")
	if strings.HasSuffix(config.BaseURL, "/api/chat") {
		config.BaseURL = strings.TrimSuffix(config.BaseURL, "/api/chat") + "/v1"
	}
	if strings.HasSuffix(config.BaseURL, "/chat/completions") {
		config.BaseURL = strings.TrimSuffix(config.BaseURL, "/chat/completions")
	}
	if strings.HasSuffix(config.BaseURL, "/api") {
		config.BaseURL = strings.TrimSuffix(config.BaseURL, "/api") + "/v1"
	}
	if config.BaseURL == "http://localhost:11434" || config.BaseURL == "http://127.0.0.1:11434" {
		config.BaseURL += "/v1"
	}
	config.BaseURL = strings.TrimSuffix(config.BaseURL, "/")

	baseSystemPrompt := `You are NetraX AI, a cybersecurity assistant for HTTP traffic analysis.

			[TOOLS]
			- If user mentions #ID -> MUST call get_request(ID)
			- Use analysis tools by default (search_traffic, get_recent_traffic)
			- Use action tools ONLY if explicitly asked
			- Do not overuse tools

			[ANTI-HALLUCINATION]
			- Never guess request data (headers, body, params)
			- If not fetched -> say "fetch required via get_request"

			[ANALYSIS]
			For each request:
			- Overview (method, endpoint, auth)
			- Security issues
			- Possible vulnerabilities
			- Risk (Low/Med/High/Critical)
			- Exploitation idea (if relevant)
			- Fix suggestions

			[STYLE]
			- Technical + concise
			- Bullet points only (NO tables)
			- Explain reasoning, not just result
			`

	systemPrompt := baseSystemPrompt

	if strings.Contains(strings.ToLower(userMsg), "test for payloads") {
		systemPrompt = `You are NetraX AI in offensive mode.

			- Focus on finding vulnerabilities using payloads
			- Suggest XSS, SQLi, SSRF, auth bypass payloads
			- Think like attacker, analyze responses
			` + baseSystemPrompt
	}

	var msgs []agentMessage
	msgs = append(msgs, agentMessage{
		Role:    "system",
		Content: systemPrompt,
	})

	for _, m := range history {
		msgs = append(msgs, agentMessage{Role: m.Role, Content: m.Content})
	}
	msgs = append(msgs, agentMessage{Role: "user", Content: userMsg})

	tools := a.getAgentTools()

	for turn := 0; turn < 5; turn++ {
		completionResp, apiErr := a.invokeLLM(ctx, config, msgs, tools)
		if apiErr != nil {
			if strings.Contains(apiErr.Error(), "context canceled") {
				return nil, fmt.Errorf("Generation canceled")
			}
			return nil, apiErr
		}
		if completionResp.Error != nil {
			return nil, fmt.Errorf("AI error: %v", completionResp.Error)
		}
		if len(completionResp.Choices) == 0 {
			return nil, fmt.Errorf("no choices in response")
		}

		msg := completionResp.Choices[0].Message
		msgs = append(msgs, msg)

		if len(msg.ToolCalls) == 0 {
			a.DB.SaveAgentMessage("user", userMsg)
			a.DB.SaveAgentMessage("assistant", msg.Content)
			history = append(history, ChatMessage{Role: "user", Content: userMsg}, ChatMessage{Role: "assistant", Content: msg.Content})
			return history, nil
		}

		toolReqMsgs := a.processToolCalls(config, msg)
		msgs = append(msgs, toolReqMsgs...)
	}

	// If we hit the turn limit, find the last assistant message that actually has content
	var finalReply string
	for i := len(msgs) - 1; i >= 0; i-- {
		if msgs[i].Role == "assistant" && msgs[i].Content != "" {
			finalReply = msgs[i].Content
			break
		}
	}

	if finalReply == "" {
		finalReply = "I have processed your request but could not generate a final summary."
	}

	a.DB.SaveAgentMessage("user", userMsg)
	a.DB.SaveAgentMessage("assistant", finalReply)
	history = append(history, ChatMessage{Role: "user", Content: userMsg}, ChatMessage{Role: "assistant", Content: finalReply})
	return history, nil
}

// AUTONOMOUS BACKGROUND AGENT
func (a *App) StartAutonomousAgent(config AIModelConfig, instruction string, urlRegex string) {
	if a.autonomousCancel != nil {
		a.autonomousCancel() // cancel previous
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.autonomousCancel = cancel
	a.Proxy.SetInterceptRegex(urlRegex)
	a.SetIntercept(true)
	if urlRegex != "" {
		runtime.EventsEmit(a.ctx, "agent_log", fmt.Sprintf("AutoPilot initialized. Traffic interception enabled with regex filter: %s", urlRegex))
	} else {
		runtime.EventsEmit(a.ctx, "agent_log", "AutoPilot initialized and traffic interception enabled.")
	}

	go a.runAutoPilot(ctx, config, instruction)
}

func (a *App) StopAutonomousAgent() {
	if a.autonomousCancel != nil {
		a.autonomousCancel()
		a.autonomousCancel = nil
		runtime.EventsEmit(a.ctx, "agent_log", "AutoPilot mode terminated gracefully.")
	}
}

func (a *App) runAutoPilot(ctx context.Context, config AIModelConfig, instruction string) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	// Ensure correct base URL formats (identical to standard execution)
	if config.BaseURL == "" {
		config.BaseURL = "https://api.openai.com/v1"
	}
	// ... we'll rely on the same normalize logic if we abstract it, but setting it purely is fine.
	config.BaseURL = strings.TrimSuffix(config.BaseURL, "/")
	if strings.HasSuffix(config.BaseURL, "/api/chat") {
		config.BaseURL = strings.TrimSuffix(config.BaseURL, "/api/chat") + "/v1"
	}
	if strings.HasSuffix(config.BaseURL, "/chat/completions") {
		config.BaseURL = strings.TrimSuffix(config.BaseURL, "/chat/completions")
	}
	if strings.HasSuffix(config.BaseURL, "/api") {
		config.BaseURL = strings.TrimSuffix(config.BaseURL, "/api") + "/v1"
	}
	if config.BaseURL == "http://localhost:11434" || config.BaseURL == "http://127.0.0.1:11434" {
		config.BaseURL += "/v1"
	}
	config.BaseURL = strings.TrimSuffix(config.BaseURL, "/")

	tools := a.getAgentTools()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// Fetch currently pending traffic
			reqs, _ := a.GetInterceptedRequests()
			resps, _ := a.GetInterceptedResponses()
			if len(reqs) == 0 && len(resps) == 0 {
				continue // Nothing to evaluate
			}

			requestPayload := map[string]interface{}{}
			if len(reqs) > 0 {
				requestPayload["intercepted_requests"] = reqs
			}
			if len(resps) > 0 {
				requestPayload["intercepted_responses"] = resps
			}
			trafficDump, _ := json.Marshal(requestPayload)

			var msgs []agentMessage
			msgs = append(msgs, agentMessage{
				Role:    "system",
				Content: fmt.Sprintf("You are operating as an Autonomous AutoPilot looping in the background.\nINSTRUCTION FROM USER:\n%s\n\nYour task is to take immediate action on intercepted traffic continuously. Do NOT give conversational responses. You must evaluate the items and use the required tools (e.g drop_request, forward_request, execute_request). For better performance, batch your actions by making multiple parallel tool calls in a single response.", instruction),
			})
			msgs = append(msgs, agentMessage{Role: "user", Content: string(trafficDump)})

			// 5-turn internal dialogue for the background worker
			for turn := 0; turn < 5; turn++ {
				completionResp, apiErr := a.invokeLLM(ctx, config, msgs, tools)
				if apiErr != nil || completionResp.Error != nil {
					runtime.EventsEmit(a.ctx, "agent_log", "AutoPilot API Error: could not complete completion.")
					break
				}
				if len(completionResp.Choices) == 0 {
					break
				}

				msg := completionResp.Choices[0].Message
				msgs = append(msgs, msg)

				if len(msg.ToolCalls) == 0 {
					// It finished acting. Maybe report to UI?
					runtime.EventsEmit(a.ctx, "agent_log", "AutoPilot completed a cycle of traffic evaluation.")
					break
				}

				toolReqMsgs := a.processToolCalls(config, msg)
				msgs = append(msgs, toolReqMsgs...)
			}
		}
	}
}
