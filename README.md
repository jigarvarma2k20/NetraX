# NetraX

![Build](https://img.shields.io/badge/build-Wails-00ADD8.svg)
![Language](https://img.shields.io/badge/language-Go-00ADD8.svg)
![Architecture](https://img.shields.io/badge/architecture-Ai_Powered-8A2BE2.svg)


## About

**NetraX** is a professional-grade HTTP traffic interception and security analysis toolkit.  
Built with **Wails** and powered by a highly concurrent **Go** backend, it delivers a deeply interactive native desktop experience for developers and security researchers. 

NetraX distinguishes itself by deeply integrating Model Context Protocol (MCP) and an embedded **Cybersecurity AI Agent**, enabling unparalleled traffic analysis, payload debugging, and automated threat hunting.


## Key Features

### NetraX AI Assistant
Your dedicated cybersecurity copilot integrated directly into the proxy layout:
- **Intelligent Debugging**: Ask the AI to identify anomalies or explain payloads dynamically based on live proxy traffic.
- **Provider Agnostic**: Connects seamlessly with standard **OpenAI (ChatGPT)**, **Google (Gemini)**, **Ollama (Local/Cloud)**, or raw Custom Endpoints inside the native UI dropdown.
- **AutoPilot Mode**: Activate an autonomous agent loop that monitors, evaluates, and intercepts your live traffic invisibly in the background.
- **Export Engine**: Generate comprehensive, highly formatted PDF reports directly from the AI chat.

### Core Proxy Modules
- **History**: Capture, query, and inspect headers, cookies, and bodies with rich syntax highlighting.
- **Interceptor**: Halt traffic on the wire! Pause, modify, and drop requests or responses dynamically.
- **Repeater**: Craft custom requests or replay captured ones to test vulnerabilities incredibly fast.
- **Comparer**: Visually differentiate responses. Great for bypass testing!
- **Decoder**: Natively translate Base64, URL Encodings, Hex, and binary schemas.

### Deep System Integration
- **Model Context Protocol (MCP)**: Native backend tooling allowing the LLM to run system-level shell commands, query proxy states, read raw bytes, or write reports directly.
- **Lightweight Architecture**: A low-overhead React + Tailwind frontend glued instantly to Go routines with zero heavy Electron bloat.


## Architecture

- **Backend:** Go (High Performance, Extensible Interfaces)
- **Frontend:** Wails / React.js / Tailwind CSS
- **Database:** SQLite (Ephemeral & Persistent tracking)


## Setup & Running

### Prerequisites
- [Go](https://golang.org/doc/install) (1.25+)
- [Node.js](https://nodejs.org/en/download/) (18+)
- [Wails CLI](https://wails.io/docs/gettingstarted/installation) (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)

### Development
Launch the interactive live-reloading development environment. This spins up a Vite dev server for the frontend and attaches it to the Go backend window:
```bash
wails dev
```
*Note: NetraX acts as a MITM proxy. When you run it for the first time, you may need to export and trust its generated CA Certificate in your browser/OS to intercept HTTPS traffic successfully.*

### Production Build
Compile a highly optimized, statically linked, standalone native OS binary. 
```bash
wails build
```
You can also build for specific platforms (cross-compilation requires Docker or respective toolchains):
```bash
wails build -platform windows/amd64
wails build -platform linux/amd64
wails build -platform darwin/universal
```
The final binary will be generated inside the `build/bin/` directory.