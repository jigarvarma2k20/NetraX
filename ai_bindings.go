package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

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

func (a *App) AgentChat(config AIModelConfig, history []ChatMessage, userMsg string) ([]ChatMessage, error) {
	if config.BaseURL == "" {
		config.BaseURL = "https://api.openai.com/v1"
	}

	// ensure no trailing slash
	config.BaseURL = strings.TrimSuffix(config.BaseURL, "/")

	// Auto-correct common URL mistakes
	if strings.HasSuffix(config.BaseURL, "/api/chat") {
		config.BaseURL = strings.TrimSuffix(config.BaseURL, "/api/chat") + "/v1"
	}
	if strings.HasSuffix(config.BaseURL, "/chat/completions") {
		config.BaseURL = strings.TrimSuffix(config.BaseURL, "/chat/completions")
	}
	if strings.HasSuffix(config.BaseURL, "/api") {
		config.BaseURL = strings.TrimSuffix(config.BaseURL, "/api") + "/v1"
	}
	// If it's a bare local ollama root
	if config.BaseURL == "http://localhost:11434" || config.BaseURL == "http://127.0.0.1:11434" {
		config.BaseURL += "/v1"
	}

	// ensure no trailing slash again after corrections
	config.BaseURL = strings.TrimSuffix(config.BaseURL, "/")

	var msgs []agentMessage
	msgs = append(msgs, agentMessage{
		Role:    "system",
		Content: "You are the NetraX AI Proxy Agent. You can intercept, read, forward, and drop HTTP traffic to help the user debug and reverse engineer. Use your available tools. Output as valid JSON.",
	})
	for _, m := range history {
		msgs = append(msgs, agentMessage{Role: m.Role, Content: m.Content})
	}
	msgs = append(msgs, agentMessage{
		Role:    "user",
		Content: userMsg,
	})

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

	httpClient := &http.Client{}
	maxTurns := 5

	for turn := 0; turn < maxTurns; turn++ {
		reqBody := llmRequest{
			Model:    config.Model,
			Messages: msgs,
			Tools:    tools,
		}

		body, err := json.Marshal(reqBody)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request: %v", err)
		}

		httpReq, err := http.NewRequestWithContext(context.Background(), "POST", config.BaseURL+"/chat/completions", bytes.NewBuffer(body))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %v", err)
		}

		httpReq.Header.Set("Content-Type", "application/json")
		if config.APIKey != "" {
			httpReq.Header.Set("Authorization", "Bearer "+config.APIKey)
		}

		resp, err := httpClient.Do(httpReq)
		if err != nil {
			return nil, fmt.Errorf("AI request failed: %v", err)
		}

		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		var completionResp llmResponse
		if err := json.Unmarshal(respBody, &completionResp); err != nil {
			return nil, fmt.Errorf("failed to parse response %v. Body was: %s", err, string(respBody))
		}

		if completionResp.Error != nil {
			return nil, fmt.Errorf("AI error: %v", completionResp.Error)
		}

		if len(completionResp.Choices) == 0 {
			return nil, fmt.Errorf("no choices in response. Code %d, Body: %s", resp.StatusCode, string(respBody))
		}

		msg := completionResp.Choices[0].Message
		msgs = append(msgs, msg)

		if len(msg.ToolCalls) == 0 {
			a.DB.SaveAgentMessage("user", userMsg)
			a.DB.SaveAgentMessage("assistant", msg.Content)
			history = append(history, ChatMessage{Role: "user", Content: userMsg}, ChatMessage{Role: "assistant", Content: msg.Content})
			return history, nil
		}

		for _, tc := range msg.ToolCalls {
			var resultStr string

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

			msgs = append(msgs, agentMessage{
				Role:       "tool",
				Content:    resultStr,
				Name:       tc.Function.Name,
				ToolCallID: tc.ID,
			})
		}
	}

	lastMsg := msgs[len(msgs)-1]
	a.DB.SaveAgentMessage("user", userMsg)
	a.DB.SaveAgentMessage("assistant", lastMsg.Content)
	history = append(history, ChatMessage{Role: "user", Content: userMsg}, ChatMessage{Role: "assistant", Content: lastMsg.Content})
	return history, nil
}
