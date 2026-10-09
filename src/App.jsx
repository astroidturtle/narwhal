import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw, MainMenu, getSceneVersion } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { blankDoc, deleteDoc, getDoc, listDocs, newId, prefs, putDoc, FORMAT_VERSION } from "./storage";
import * as act from "./actions";
import LassoOverlay from "./LassoOverlay";

const SAVE_DELAY = 600;
const KEPT_APPSTATE = ["viewBackgroundColor", "gridModeEnabled", "scrollX", "scrollY", "zoom", "theme", "penMode"];

const PRESETS = {
  pen: { currentItemStrokeColor: "#1e1e1e", currentItemOpacity: 100, currentItemStrokeWidth: 1 },
  highlighter: { currentItemStrokeColor: "#fab005", currentItemOpacity: 35, currentItemStrokeWidth: 4 },
};

function pickAppState(appState) {
  const out = {};
  for (const k of KEPT_APPSTATE) if (appState[k] !== undefined) out[k] = appState[k];
  return out;
}

function usedFiles(elements, files) {
  const out = {};
  for (const el of elements) {
    if (el.type === "image" && el.fileId && files[el.fileId]) out[el.fileId] = files[el.fileId];
  }
  return out;
}

export default function App() {
  const [docs, setDocs] = useState([]);
  const [doc, setDoc] = useState(null); // the loaded document record
  const [api, setApi] = useState(null);
  const [save, setSave] = useState("saved"); // saved | pending | error
  const [status, setStatus] = useState({ zoom: 100, tool: "selection", theme: "light", penMode: false });
  const [preset, setPreset] = useState(null); // pen | highlighter | null
  const [lasso, setLasso] = useState(null); // null | new | add | remove
  const [toast, setToast] = useState(null);
  const [showNotice, setShowNotice] = useState(() => !prefs.get("noticeDismissed", false));

  const pending = useRef(null);
  const lastVersion = useRef(-1);
  const docRef = useRef(null);
  docRef.current = doc;

  const flash = useCallback((msg) => {
    setToast(msg);
    clearTimeout(flash.t);
    flash.t = setTimeout(() => setToast(null), 3500);
  }, []);

  // Handy for debugging and automated tests: window.narwhal is the editor API.
  useEffect(() => {
    window.narwhal = api;
  }, [api]);

  // ---------- documents ----------
  const refreshList = useCallback(async () => setDocs(await listDocs()), []);

  const openDoc = useCallback(async (id) => {
    await flushSave();
    const d = await getDoc(id);
    if (!d) return;
    lastVersion.current = -1;
    setLasso(null);
    setPreset(null);
    setDoc(d);
    prefs.set("lastDoc", id);
  }, []);

  useEffect(() => {
    (async () => {
      let list = await listDocs();
      if (!list.length) {
        const first = blankDoc("My first note");
        await putDoc(first);
        list = await listDocs();
      }
      setDocs(list);
      const last = prefs.get("lastDoc", null);
      const target = list.find((d) => d.id === last) ? last : list[0].id;
      setDoc(await getDoc(target));
    })().catch(() => setSave("error"));
  }, []);

  async function flushSave() {
    if (!pending.current) return;
    const job = pending.current;
    pending.current = null;
    clearTimeout(job.timer);
    await job.run();
  }

  const scheduleSave = (elements, appState, files) => {
    const current = docRef.current;
    if (!current) return;
    if (pending.current) clearTimeout(pending.current.timer);
    setSave("pending");
    const run = async () => {
      const live = elements.filter((e) => !e.isDeleted);
      const record = {
        ...current,
        formatVersion: FORMAT_VERSION,
        updatedAt: Date.now(),
        elements: live,
        appState: pickAppState(appState),
        files: usedFiles(live, files),
      };
      try {
        await putDoc(record);
        docRef.current = record;
        setSave("saved");
        refreshList();
      } catch {
        setSave("error");
      }
    };
    pending.current = { run, timer: setTimeout(() => flushSave(), SAVE_DELAY) };
  };

  // Save on tab close / hide.
  useEffect(() => {
    const h = () => document.visibilityState === "hidden" && flushSave();
    document.addEventListener("visibilitychange", h);
    window.addEventListener("pagehide", flushSave);
    return () => {
      document.removeEventListener("visibilitychange", h);
      window.removeEventListener("pagehide", flushSave);
    };
  }, []);

  const onChange = (elements, appState, files) => {
    const version = getSceneVersion(elements) + Object.keys(files).length * 1e9;
    const zoom = Math.round(appState.zoom.value * 100);
    const tool = appState.activeTool.type;
    setStatus((s) =>
      s.zoom === zoom && s.tool === tool && s.theme === appState.theme && s.penMode === appState.penMode
        ? s
        : { zoom, tool, theme: appState.theme, penMode: appState.penMode },
    );
    if (tool !== "freedraw" && preset) {
      // Leaving the highlighter: don't let its yellow, translucent style leak
      // into the next text box or shape.
      if (preset === "highlighter") {
        setTimeout(() => api?.updateScene({ appState: { currentItemStrokeColor: "#1e1e1e", currentItemOpacity: 100 } }), 0);
      }
      setPreset(null);
    }
    if (lastVersion.current === -1) {
      lastVersion.current = version; // first render after load: nothing to save
      return;
    }
    if (version !== lastVersion.current) {
      lastVersion.current = version;
      scheduleSave(elements, appState, files);
    }
  };

  const newDocument = async () => {
    const name = window.prompt("Name for the new document:", "Untitled");
    if (name === null) return;
    const d = blankDoc(name.trim() || "Untitled");
    await putDoc(d);
    await refreshList();
    openDoc(d.id);
  };

  const renameDocument = async () => {
    if (!doc) return;
    const name = window.prompt("Rename document:", doc.name);
    if (name === null || !name.trim()) return;
    await flushSave();
    const d = { ...(await getDoc(doc.id)), name: name.trim() };
    await putDoc(d);
    setDoc((cur) => ({ ...cur, name: d.name }));
    docRef.current = { ...docRef.current, name: d.name };
    refreshList();
  };

  const duplicateDocument = async () => {
    if (!doc) return;
    await flushSave();
    const src = await getDoc(doc.id);
    const copy = { ...src, id: newId(), name: `${src.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now() };
    await putDoc(copy);
    await refreshList();
    openDoc(copy.id);
  };

  const removeDocument = async () => {
    if (!doc) return;
    if (!window.confirm(`Delete "${doc.name}"? This can't be undone.\n\nTip: download a backup first (menu ☰ → Save to…).`)) return;
    pending.current && clearTimeout(pending.current.timer);
    pending.current = null;
    await deleteDoc(doc.id);
    let list = await listDocs();
    if (!list.length) {
      await putDoc(blankDoc("Untitled"));
      list = await listDocs();
    }
    setDocs(list);
    openDoc(list[0].id);
  };

  // ---------- tools ----------
  const usePreset = (name) => {
    if (!api) return;
    setLasso(null);
    api.setActiveTool({ type: "freedraw" });
    api.updateScene({ appState: PRESETS[name] });
    setPreset(name);
  };

  const startLasso = (mode) => {
    if (!api) return;
    setPreset(null);
    setLasso((cur) => (cur === mode ? null : mode));
  };

  useEffect(() => {
    if (!lasso) return;
    const esc = (e) => e.key === "Escape" && setLasso(null);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [lasso]);

  const togglePenMode = () => {
    if (!api) return;
    api.updateScene({ appState: { penMode: !api.getAppState().penMode } });
  };

  const doCopy = async () => (await act.copySelection()) ? flash("Copied") : flash("Select something first, or press Ctrl/Cmd+C.");
  const doCut = async () => (await act.cutSelection()) ? flash("Cut") : flash("Select something first, or press Ctrl/Cmd+X.");
  const doPaste = async () => {
    try {
      await act.pasteFromClipboard();
    } catch {
      flash("Clipboard access was blocked. Press Ctrl/Cmd+V instead, or drag an image file onto the page.");
    }
  };
  const doCapture = async () => {
    if (!act.canCaptureScreen()) {
      flash("Screen capture isn't available in this browser. Take a screenshot with your OS, then paste it here.");
      return;
    }
    try {
      await act.captureScreen(api);
      flash("Captured. Double-click the image to crop it.");
    } catch {
      flash("Capture cancelled. You can also take an OS screenshot and paste it with Ctrl/Cmd+V.");
    }
  };

  const dismissNotice = () => {
    setShowNotice(false);
    prefs.set("noticeDismissed", true);
  };

  const toolLabel = lasso ? `lasso (${lasso})` : preset || status.tool;
  const saveLabel = { saved: "Saved in this browser", pending: "Saving…", error: "⚠ Not saved — storage blocked" }[save];

  return (
    <div className="app" data-theme={status.theme}>
      <header className="bar" role="toolbar" aria-label="Narwhal toolbar">
        <div className="group brand">
          <span className="logo" aria-hidden>🐋</span>
          <strong>Narwhal</strong>
        </div>

        <div className="group">
          <select
            className="doc-select"
            value={doc?.id || ""}
            onChange={(e) => openDoc(e.target.value)}
            aria-label="Open document"
          >
            {docs.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button onClick={newDocument} title="New document">＋ New</button>
          <button onClick={renameDocument} title="Rename document">Rename</button>
          <button onClick={duplicateDocument} title="Duplicate document">Duplicate</button>
          <button onClick={removeDocument} title="Delete document" className="danger">Delete doc</button>
        </div>

        <div className="group">
          <button className={preset === "pen" ? "on" : ""} onClick={() => usePreset("pen")} title="Pen (pressure-sensitive with a stylus)">✒️ Pen</button>
          <button className={preset === "highlighter" ? "on" : ""} onClick={() => usePreset("highlighter")} title="Highlighter">🖍 Highlight</button>
          <button className={lasso === "new" ? "on" : ""} onClick={() => startLasso("new")} title="Lasso select">➰ Lasso</button>
          {lasso && (
            <>
              <button className={lasso === "add" ? "on" : ""} onClick={() => startLasso("add")} title="Lasso: add to selection">＋ Add</button>
              <button className={lasso === "remove" ? "on" : ""} onClick={() => startLasso("remove")} title="Lasso: remove from selection">－ Remove</button>
            </>
          )}
        </div>

        <div className="group">
          <button onClick={act.undo} title="Undo (Ctrl/Cmd+Z)">↶ Undo</button>
          <button onClick={act.redo} title="Redo (Ctrl/Cmd+Shift+Z)">↷ Redo</button>
          <button onClick={doCopy} title="Copy selection">Copy</button>
          <button onClick={doCut} title="Cut selection">Cut</button>
          <button onClick={doPaste} title="Paste">Paste</button>
          <button onClick={act.duplicateSelection} title="Duplicate selection (Ctrl/Cmd+D)">⧉ Duplicate sel.</button>
          <button onClick={act.deleteSelection} title="Delete selection">🗑</button>
        </div>

        <div className="group">
          <button onClick={doCapture} title="Capture a still of a screen, window or tab you choose">📸 Capture</button>
          <button className={status.penMode ? "on" : ""} onClick={togglePenMode} title="Stylus draws; touch pans and zooms">
            🖊 Stylus mode {status.penMode ? "on" : "off"}
          </button>
        </div>
      </header>

      <main className="stage">
        {doc && (
          <Excalidraw
            key={doc.id}
            excalidrawAPI={setApi}
            initialData={{
              elements: doc.elements,
              appState: { ...doc.appState, name: doc.name },
              files: doc.files,
              scrollToContent: !doc.appState?.zoom,
            }}
            onChange={onChange}
            name={doc.name}
            UIOptions={{ canvasActions: { toggleTheme: true, saveToActiveFile: true, loadScene: true, export: { saveFileToDisk: true } } }}
          >
            <MainMenu>
              <MainMenu.DefaultItems.LoadScene />
              <MainMenu.DefaultItems.SaveToActiveFile />
              <MainMenu.DefaultItems.Export />
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ToggleTheme />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.DefaultItems.Help />
            </MainMenu>
          </Excalidraw>
        )}
        {lasso && api && (
          <LassoOverlay
            api={api}
            mode={lasso}
            onDone={(n) => {
              setLasso(null);
              flash(n ? `Selected ${n} object${n > 1 ? "s" : ""} — drag to move, handles to resize/rotate.` : "Nothing inside the loop.");
            }}
          />
        )}
      </main>

      <footer className="status" aria-live="polite">
        <span>🔍 {status.zoom}%</span>
        <span>🛠 {toolLabel}</span>
        <span className={`save ${save}`}>{saveLabel}</span>
        {toast && <span className="toast">{toast}</span>}
      </footer>

      {showNotice && (
        <div className="notice" role="note">
          <span>
            📦 Your documents live <b>only in this browser on this device</b>. They don't sync, and clearing site data erases them.
            Download backups via ☰ → <i>Save to…</i>. Sharing the app link shares the app, not your notes.
          </span>
          <button onClick={dismissNotice}>Got it</button>
        </div>
      )}
    </div>
  );
}
