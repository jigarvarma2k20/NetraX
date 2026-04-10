
/**
 * Parse a header string (JSON or raw) into an object.
 * @param {string|object} headerData 
 * @returns {object}
 */
export function parseHeaders(headerData) {
    if (typeof headerData === 'object' && headerData !== null) return headerData;
    try {
        return JSON.parse(headerData || "{}");
    } catch {
        return {};
    }
}

/**
 * Format a header object into a standard HTTP header string block.
 * @param {object} headers 
 * @returns {string}
 */
export function formatHeaders(headers) {
    if (!headers) return "";
    return Object.entries(headers).map(([k, v]) =>
        `${k}: ${Array.isArray(v) ? v.join(", ") : v}`
    ).join("\n");
}

/**
 * Parse a raw header block string (from editor) into an object.
 * @param {string} headerBlock 
 * @returns {object}
 */
export function parseHeaderBlockToJson(headerBlock) {
    const lines = headerBlock.split("\n");
    const headers = {};
    lines.forEach(line => {
        const colonIdx = line.indexOf(":");
        if (colonIdx !== -1) {
            const key = line.substring(0, colonIdx).trim();
            const val = line.substring(colonIdx + 1).trim();
            // Go http.Header expects map[string][]string
            // If key exists, append (though simplified editor usually has one line per key)
            if (headers[key]) {
                headers[key].push(val);
            } else {
                headers[key] = [val];
            }
        }
    });
    return headers;
}

/**
 * Parse a request line (GET / HTTP/1.1)
 * @param {string} line 
 */
export function parseRequestLine(line) {
    if (!line) return { method: "GET", url: "/", proto: "HTTP/1.1" };
    const parts = line.split(" ");
    return {
        method: parts[0] || "GET",
        url: parts[1] || "",
        proto: parts[2] || "HTTP/1.1"
    };
}

/**
 * Parse a response line (HTTP/1.1 200 OK)
 * @param {string} line 
 */
export function parseResponseLine(line) {
    if (!line) return { proto: "HTTP/1.1", searchStatus: 200, statusText: "OK" };

    const firstSpace = line.indexOf(" ");
    const secondSpace = line.indexOf(" ", firstSpace + 1);

    if (firstSpace === -1) return { proto: line, statusCode: 0, statusText: "" };

    const proto = line.substring(0, firstSpace);
    const statusCodeStr = secondSpace === -1
        ? line.substring(firstSpace + 1)
        : line.substring(firstSpace + 1, secondSpace);
    const statusText = secondSpace === -1 ? "" : line.substring(secondSpace + 1);

    return {
        proto,
        statusCode: parseInt(statusCodeStr) || 0,
        statusText
    };
}

/**
 * Split a raw message into header block and body.
 * Handles \n\n and \r\n\r\n.
 * @param {string} raw 
 * @returns {{headerBlock: string, body: string}}
 */
export function splitMessage(raw) {
    // Navigate strictly for double newlines
    let splitIndex = raw.indexOf("\n\n");
    let splitLen = 2;

    if (splitIndex === -1) {
        splitIndex = raw.indexOf("\r\n\r\n");
        splitLen = 4;
    }

    if (splitIndex === -1) {
        // Fallback: assume all headers if no body separator, or check if it looks like just body?
        // Safer to assume it's just headers if starts with HTTP or GET, otherwise...
        // For now, if no separator, returned body is empty.
        // Or maybe single newline? No, headers must end with empty line.
        return { headerBlock: raw, body: "" };
    }

    return {
        headerBlock: raw.substring(0, splitIndex),
        body: raw.substring(splitIndex + splitLen)
    };
}
