/**
 * This file is part of NetraX.
 * Repository: https://github.com/jigarvarma2k20/NetraX
 *
 * Copyright (c) 2026 NetraX Contributors
 *
 * SPDX-License-Identifier: GPL-3.0
 */

import Header from "./Header";
import MessageEditor from "./MessageEditor";
import { forwardRef, useState, useEffect, useRef } from "react";
import { parseHeaders, formatHeaders, parseRequestLine, parseHeaderBlockToJson, splitMessage } from "../utils/http";

export default forwardRef(function RequestPanel({ dto, editable, onChange }, ref) {
  if (!dto) return <div ref={ref} className="flex-1 min-w-65 border-r border-panel-border bg-panel-dark" />;

  const [rawContent, setRawContent] = useState('');
  const lastPassedDtoStr = useRef('');

  // Hydrate raw content from DTO
  useEffect(() => {
    if (!dto) {
      setRawContent('');
      return;
    }
    
    // Ignore updates that are just echoes of our own typing
    const currentDtoStr = JSON.stringify(dto);
    if (lastPassedDtoStr.current === currentDtoStr) {
      return;
    }

    const statusLine = `${dto.method} ${dto.url} ${dto.proto || "HTTP/1.1"}`;
    const headers = parseHeaders(dto.header);
    const headerBlock = formatHeaders(headers);
    setRawContent(`${statusLine}\n${headerBlock}\n\n${dto.body || ""}`);
    
    lastPassedDtoStr.current = currentDtoStr;
  }, [dto]);

  const handleEditorChange = (newVal) => {
    setRawContent(newVal);

    if (onChange && editable) {
      try {
        const { headerBlock, body } = splitMessage(newVal);
        const lines = headerBlock.split("\n");
        const firstLine = lines[0] || "";
        const headerLines = lines.slice(1).join("\n");

        const { method, url, proto } = parseRequestLine(firstLine);
        const headers = parseHeaderBlockToJson(headerLines);

        const newDto = {
          ...dto,
          method,
          url,
          proto: proto || "HTTP/1.1",
          header: JSON.stringify(headers),
          body: body
        };

        lastPassedDtoStr.current = JSON.stringify(newDto);
        onChange(newDto);
      } catch (e) {
        // parsing error, ignore until valid
      }
    }
  };

  return (
    <div ref={ref} className="flex-1 min-w-65 min-h-0 overflow-hidden border-r border-panel-border flex flex-col bg-panel-dark">
      <Header title="Request" />
      <div className="flex-1 min-h-0 overflow-hidden">
        <MessageEditor
          data={rawContent}
          onChange={editable ? handleEditorChange : undefined}
          readOnly={!editable}
          placeHolder="GET / HTTP/1.1"
        />
      </div>
    </div>
  );
});