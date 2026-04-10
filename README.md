# NetraX

![Build](https://img.shields.io/badge/build-Wails-00ADD8.svg)
![Language](https://img.shields.io/badge/language-Go-00ADD8.svg)
---

## About

**NetraX** is a professional-grade HTTP traffic interception and security analysis tool.  
Built with **Wails** and powered by a **Go** backend, it delivers a fast, native desktop experience for developers and security researchers.

---

## Core Modules

### History
Capture and inspect all HTTP/HTTPS traffic:
- Headers, cookies, and body
- Clean structured view
- Syntax highlighting support

### Interceptor
Modify traffic in real-time:
- Pause requests & responses
- Edit headers, params, payloads
- Forward modified traffic

### Repeater
Manual testing toolkit:
- Replay captured requests
- Craft custom requests
- Test vulnerabilities faster

### Comparer
Compare responses visually:
- Highlight differences
- Track behavior changes
- Useful for bypass testing

### Decoder
Encoding/decoding utilities:
- Base64 / Base64URL
- URL Encoding
- Hex
- Binary

---

## Architecture

- **Backend:** Go (high performance, concurrency)
- **Framework:** Wails (native desktop UI) with React.js
---

## Setup

### Prerequisites
- Go (1.18+)
- Wails CLI
- Node.js

---

## Run (Development)

```bash
wails dev
```

## Building

```bash
wails build
```