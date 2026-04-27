import Header from "./Header";
import MessageEditor from "./MessageEditor";
import { forwardRef, useState, useEffect, useRef } from "react";
import { parseHeaders, formatHeaders, parseResponseLine, parseHeaderBlockToJson, splitMessage } from "../utils/http";

export default forwardRef(function ResponsePanel({ dto, editable, onChange }, ref) {
  if (!dto) return <div ref={ref} className="flex-1 min-w-65 overflow-hidden flex flex-col bg-background-dark border-l border-panel-border" />;

  const [rawContent, setRawContent] = useState('');
  const isInternalChange = useRef(false);

  useEffect(() => {
    if (dto) {
      if (isInternalChange.current) {
        isInternalChange.current = false;
        return;
      }
      const statusLine = `${dto.proto} ${dto.status_code} ${dto.status}`;
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

        const { proto, statusCode, statusText } = parseResponseLine(firstLine);
        const headers = parseHeaderBlockToJson(headerLines);

        onChange({
          ...dto,
          proto: proto || dto.proto,
          status_code: statusCode || dto.status_code,
          status: statusText || dto.status,
          header: JSON.stringify(headers),
          body: body
        });
      } catch (e) { }
    }
  };

  return (
    <div ref={ref} className="flex-1 min-w-65 min-h-0 overflow-hidden flex flex-col bg-panel-dark">
      <Header title="Response" />
      <div className="flex-1 min-h-0 overflow-hidden">
        <MessageEditor
          data={rawContent}
          onChange={editable ? handleEditorChange : undefined}
          readOnly={!editable}
          placeHolder="HTTP/1.1 200 OK"
        />
      </div>
    </div>
  );
});
