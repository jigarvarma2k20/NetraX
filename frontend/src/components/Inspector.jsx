import { useRef, useEffect } from "react";
import RequestPanel from "./RequestPanel";
import ResponsePanel from "./ResponsePanel";

export default function Inspector({ txn }) {
  const containerRef = useRef(null);
  const resizerRef = useRef(null);
  const reqRef = useRef(null);
  const resRef = useRef(null);

  const drag = useRef({
    active: false,
    startY: 0,
    startH: 0,
    side: false,
    startX: 0,
    startReqW: 0,
    startResW: 0
  });

  useEffect(() => {
    const bar = resizerRef.current;
    if (!bar) return;

    const onMouseDown = (e) => {
      drag.current.active = true;
      drag.current.startY = e.clientY;
      drag.current.startH = containerRef.current.offsetHeight;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "row-resize";
    };

    bar.addEventListener("mousedown", onMouseDown);
    return () => bar.removeEventListener("mousedown", onMouseDown);
  }, []);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (drag.current.active) {
        const dy = drag.current.startY - e.clientY;
        let newH = drag.current.startH + dy;
        newH = Math.max(150, Math.min(newH, window.innerHeight * 0.8));
        if (containerRef.current) {
          containerRef.current.style.height = `${newH}px`;
        }
      }

      if (drag.current.side) {
        const dx = e.clientX - drag.current.startX;
        const newReqW = drag.current.startReqW + dx;
        const newResW = drag.current.startResW - dx;

        if (newReqW > 200 && newResW > 200 && reqRef.current && resRef.current) {
          reqRef.current.style.flex = "none";
          reqRef.current.style.width = `${newReqW}px`;

          resRef.current.style.flex = "none";
          resRef.current.style.width = `${newResW}px`;
        }
      }
    };

    const onMouseUp = () => {
      if (drag.current.active || drag.current.side) {
        drag.current.active = false;
        drag.current.side = false;
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ height: "360px" }}
      className="bg-panel-dark border-t border-panel-border flex flex-col relative"
    >
      {/* Resizer Handle */}
      <div
        ref={resizerRef}
        className="absolute -top-1 left-0 w-full h-2 cursor-row-resize hover:bg-primary/30 transition-colors z-10 opacity-0 hover:opacity-100"
      />

      {/* Header */}
      <div className="border-b border-panel-border flex items-center justify-between px-3 h-10 shrink-0 bg-[#0c101c]">
        <h1 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Inspector</h1>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        <RequestPanel ref={reqRef} dto={txn?.request} editable={false} />

        {/* Horizontal Resizer */}
        <div
          className="w-1 cursor-col-resize bg-panel-border hover:bg-primary transition-colors flex items-center justify-center group z-10"
          onMouseDown={(e) => {
            drag.current.side = true;
            drag.current.startX = e.clientX;
            drag.current.startReqW = reqRef.current?.offsetWidth || 0;
            drag.current.startResW = resRef.current?.offsetWidth || 0;
            document.body.style.userSelect = "none";
            document.body.style.cursor = "col-resize";
          }}
        >
          <div className="h-4 w-0.5 bg-text-secondary/30 group-hover:bg-white rounded hidden group-hover:block" />
        </div>

        <ResponsePanel ref={resRef} dto={txn?.response} editable={false} />
      </div>
    </div>
  );
}