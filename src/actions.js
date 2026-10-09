// Stylus-friendly buttons that drive the editor's own commands, plus image
// insertion and screen capture.
import { convertToExcalidrawElements, CaptureUpdateAction } from "@excalidraw/excalidraw";
import { newId } from "./storage";

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function editorRoot() {
  return document.querySelector(".excalidraw");
}

// Re-use the editor's keyboard handling, so buttons behave exactly like the
// shortcuts (one undo step, same rules, same history).
export function sendKey(key, { mod = false, shift = false } = {}) {
  const root = editorRoot();
  if (!root) return;
  const code = key.length === 1 ? `Key${key.toUpperCase()}` : key;
  const ev = new KeyboardEvent("keydown", {
    key: shift && key.length === 1 ? key.toUpperCase() : key,
    code,
    ctrlKey: mod && !isMac,
    metaKey: mod && isMac,
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });
  root.dispatchEvent(ev);
}

export const undo = () => sendKey("z", { mod: true });
export const redo = () => sendKey("z", { mod: true, shift: true });
export const deleteSelection = () => sendKey("Delete");
export const duplicateSelection = () => sendKey("d", { mod: true });

// Copy: ask the editor to serialise the selection into a DataTransfer, then
// hand that to the system clipboard. Within Narwhal, pasted objects stay
// fully editable.
export async function copySelection() {
  const dt = new DataTransfer();
  const ev = new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true });
  document.dispatchEvent(ev);
  const text = dt.getData("text/plain");
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function cutSelection() {
  const ok = await copySelection();
  if (ok) deleteSelection();
  return ok;
}

// Paste: read the system clipboard (needs permission) and replay it into the
// editor as a normal paste event. Keyboard Ctrl/Cmd+V never needs this.
export async function pasteFromClipboard() {
  if (!navigator.clipboard) throw new Error("no-clipboard");
  const dt = new DataTransfer();
  if (navigator.clipboard.read) {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith("image/"));
      if (imageType) {
        const blob = await item.getType(imageType);
        dt.items.add(new File([blob], "pasted-image", { type: imageType }));
      } else if (item.types.includes("text/plain")) {
        dt.setData("text/plain", await (await item.getType("text/plain")).text());
      }
    }
  } else {
    dt.setData("text/plain", await navigator.clipboard.readText());
  }
  const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
  document.dispatchEvent(ev);
}

const blobToDataURL = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

// Insert an image (data URL) centred in the current view, then select it.
export async function insertImage(api, dataURL, mimeType, naturalW, naturalH) {
  const appState = api.getAppState();
  const zoom = appState.zoom.value;
  const viewW = appState.width / zoom;
  const viewH = appState.height / zoom;
  const scale = Math.min(1, (viewW * 0.7) / naturalW, (viewH * 0.7) / naturalH);
  const width = naturalW * scale;
  const height = naturalH * scale;
  const x = -appState.scrollX + viewW / 2 - width / 2;
  const y = -appState.scrollY + viewH / 2 - height / 2;

  const fileId = newId();
  api.addFiles([{ id: fileId, dataURL, mimeType, created: Date.now() }]);
  const [el] = convertToExcalidrawElements([{ type: "image", fileId, x, y, width, height, status: "saved" }]);
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), el],
    appState: { selectedElementIds: { [el.id]: true } },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.setActiveTool({ type: "selection" });
}

export const canCaptureScreen = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

// One still frame from a screen/window/tab the user explicitly picks.
// The stream is stopped as soon as the frame is grabbed.
export async function captureScreen(api) {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    // Give the first real frame a moment to arrive.
    await new Promise((r) => setTimeout(r, 250));
    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(video, 0, 0, w, h);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    const dataURL = await blobToDataURL(blob);
    await insertImage(api, dataURL, "image/png", w, h);
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
