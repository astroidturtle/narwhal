import { useEffect, useRef } from "react";
import { viewportCoordsToSceneCoords, CaptureUpdateAction } from "@excalidraw/excalidraw";
import { computeLassoSelection } from "./lasso";

// A transparent layer over the canvas that captures one freehand loop, turns
// it into a selection, then hands control back to the editor's select tool so
// the selection can be dragged, resized, rotated, copied, grouped...
export default function LassoOverlay({ api, mode, onDone }) {
  const canvasRef = useRef(null);
  const pathRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    const pts = pathRef.current;
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] - r.left, pts[0][1] - r.top);
    for (const [x, y] of pts) ctx.lineTo(x - r.left, y - r.top);
    ctx.closePath();
    ctx.fillStyle = mode === "remove" ? "rgba(224,49,49,0.08)" : "rgba(105,101,219,0.10)";
    ctx.fill();
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = mode === "remove" ? "#e03131" : "#6965db";
    ctx.stroke();
  };

  const onPointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pathRef.current = [[e.clientX, e.clientY]];
    draw();
  };

  const onPointerMove = (e) => {
    if (!pathRef.current) return;
    const events = e.nativeEvent.getCoalescedEvents ? e.nativeEvent.getCoalescedEvents() : [e];
    for (const ce of events) pathRef.current.push([ce.clientX, ce.clientY]);
    draw();
  };

  const finish = () => {
    const pts = pathRef.current;
    pathRef.current = null;
    draw();
    if (!pts || pts.length < 3 || !api) return;
    const appState = api.getAppState();
    const poly = pts.map(([clientX, clientY]) => {
      const { x, y } = viewportCoordsToSceneCoords({ clientX, clientY }, appState);
      return [x, y];
    });
    const selection = computeLassoSelection(
      api.getSceneElements(),
      poly,
      mode,
      appState.selectedElementIds,
    );
    api.setActiveTool({ type: "selection" });
    api.updateScene({
      appState: { ...selection, editingGroupId: null },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    onDone(Object.keys(selection.selectedElementIds).length);
  };

  return (
    <canvas
      ref={canvasRef}
      className="lasso-overlay"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={() => {
        pathRef.current = null;
        draw();
      }}
      aria-label="Lasso: draw a loop around what you want to select"
    />
  );
}
