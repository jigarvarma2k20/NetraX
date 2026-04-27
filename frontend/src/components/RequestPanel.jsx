import Header from "./Header";
import MessageEditor from "./MessageEditor";
import { forwardRef, useState, useEffect, useRef } from "react";
import { parseHeaders, formatHeaders, parseRequestLine, parseHeaderBlockToJson, splitMessage } from "../utils/http";

export default forwardRef(function RequestPanel({ dto, editable, onChange }, ref) {
  if (!dto) return <div ref={ref} className="flex-1 min-w-65 border-r border-panel-border bg-panel-dark" />;

  const [rawContent, setRawContent] = useState('');
  const isInternalChange = useRef(false);

  // Hydrate raw content from DTO
  useEffect(() => {
    if (dto) {
      // If this DTO update was triggered by our own typing, don't re-hydrate and lose cursor position
      if (isInternalChange.current) {
        isInternalChange.current = false;
        return;
      }
      const statusLine = `${dto.method} ${dto.url} ${dto.proto || "HTTP/1.1"}`;
      const headers = parseHeaders(dto.header);
      const headerBlock = formatHeaders(headers);
      setRawContent(`${statusLine}\n${headerBlock}\n\n${dto.body || ""}`);
    } else {
      setRawContent('');
    }
  }, [dto]);

  const handleEditorChange = (newVal) => {
    setRawContent(newVal);

    if (onChange && editable) {
      isInternalChange.current = true;
      try {
        const { headerBlock, body } = splitMessage(newVal);
        const lines = headerBlock.split("\n");
        const firstLine = lines[0] || "";
        const headerLines = lines.slice(1).join("\n");

        const { method, url, proto } = parseRequestLine(firstLine);
        const headers = parseHeaderBlockToJson(headerLines);

        onChange({
          ...dto,
          method,
          url,
          proto: proto || "HTTP/1.1",
          header: JSON.stringify(headers),
          body: body
        });
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