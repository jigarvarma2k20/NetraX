# NetraX

![License](https://img.shields.io/badge/license-GPLv3-blue.svg)
![Build](https://img.shields.io/badge/build-Wails-00ADD8.svg)
![Language](https://img.shields.io/badge/language-Go-00ADD8.svg)
![Frontend](https://img.shields.io/badge/frontend-React-61DAFB.svg)
![Architecture](https://img.shields.io/badge/architecture-AI_Powered-8A2BE2.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)


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

Prebuilt binaries are available on the [Releases](https://github.com/jigarvarma2k20/NetraX/releases) page.

Steps:
1. Go to the releases page  
2. Download the binary for your platform (Windows / Linux / macOS)  
3. Extract (if needed)  
4. Run the executable  

No additional setup is required.

## Build from Source

### Prerequisites

- [Go](https://golang.org/doc/install) (1.25+)  
- [Node.js](https://nodejs.org/en/download/) (18+)  
- [Wails CLI](https://wails.io/docs/gettingstarted/installation)  

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

## License

This project is licensed under the GNU General Public License v3.  
See the `LICENSE` file for the full license text.


## Third Party Licenses

This project includes third-party components.  
See the `THIRD_PARTY_LICENSES` file for details.


## Acknowledgements

- [goproxy](https://github.com/elazarl/goproxy) by Elazar Leibovich  
- The open-source community and contributors whose work made this project possible  


## Disclaimer

This project is intended for educational use and authorized security testing only.

By using NetraX, you agree that:
- You will only use it on systems you own or have explicit permission to test  
- You are responsible for complying with all applicable laws and regulations  
- The authors and contributors are not responsible for any misuse, damage, or legal consequences resulting from its use  

Use responsibly.