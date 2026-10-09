# 🐋 Narwhal

A notepad and a sketchpad on the same page, built for pen tablets. Type, handwrite, highlight, draw shapes, paste screenshots, then lasso any mix of it and move, resize, rotate, copy or group it.

**Live app:** https://astroidturtle.github.io/narwhal/. No sign-in, nothing to install.

> **v0.1 draft.** The drawing engine is [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT). Narwhal adds the pen-tablet layer, freehand lasso, multi-document autosave, screen capture and stylus-friendly buttons on top.

## Where your notes live (read this)

- Documents are saved **only in the browser and device you're using** (IndexedDB), including pasted images.
- They **don't sync**, aren't shared, and **are lost if you clear site data**.
- Back up with **☰ → Save to…**, which downloads an editable `.excalidraw` file. Open it later with **☰ → Open**.
- Sharing the app link shares the *app*, not your notes. To share a note, send the file.

## What works in v0.1

| Area | Status |
|---|---|
| Pen (pressure-sensitive with a stylus), pencil/freedraw, highlighter | ✅ |
| Lines, arrows, rectangles, diamonds, ellipses, eraser | ✅ |
| Text boxes (font, size, colour, alignment) | ✅ (no bold/italic or lists yet) |
| **Freehand lasso**, with Add and Remove modes | ✅ |
| Rectangle select, tap select, Shift-click add | ✅ |
| Move, resize (Shift locks aspect), rotate, duplicate, delete, z-order, group/ungroup | ✅ |
| Copy / cut / paste (keyboard + buttons) | ✅ |
| Paste screenshots, drag-drop images, image upload, **crop** (double-click an image) | ✅ |
| 📸 Capture: one still of a screen/window/tab *you* pick; stream stops immediately | ✅ |
| Stylus mode: pen draws, touch pans/zooms | ✅ |
| Zoom, pan (Space+drag, hand tool), grid, light/dark theme | ✅ |
| Multiple named documents: new, rename, duplicate, delete (with confirm) | ✅ |
| Autosave with status indicator | ✅ |
| Export PNG/SVG (whole or selection, transparent or solid background), save/open project file | ✅ |
| Undo/redo for every edit | ✅ |
| Area lasso (copy a freehand region of pixels as a transparent PNG) | ⏳ v0.2 |
| Ruled / dotted backgrounds, print view, rich text (bold, lists) | ⏳ v0.2 |

### Lasso rule

An object is selected when **at least half of its sample points fall inside the loop**. Strokes, lines and arrows are sampled along their path. Text, shapes and images use their corners plus centre. Grouped objects are always selected as a whole group. After the loop closes, Narwhal switches to the normal select tool, so you can drag, resize, rotate or press keys right away.

## Shortcuts

| Keys | Action |
|---|---|
| Ctrl/Cmd + Z, Ctrl/Cmd + Shift + Z | Undo, redo |
| Ctrl/Cmd + C / X / V | Copy, cut, paste |
| Ctrl/Cmd + D | Duplicate |
| Ctrl/Cmd + A | Select all |
| Delete / Backspace | Delete selection |
| Arrows, Shift + arrows | Nudge, big nudge |
| Space + drag | Pan |
| Ctrl/Cmd + G, Ctrl/Cmd + Shift + G | Group, ungroup |
| Esc | Cancel lasso / deselect |
| Shift + ? | Full shortcut list |

Shortcuts are ignored while you're typing in a text box.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
npm run preview  # serve dist/ at http://localhost:4173
```

### Tests

`tests/e2e.mjs` drives headless Chromium through 19 checks: pen, highlighter, text, pasted screenshot, lasso select/remove, drag-move, undo/redo, duplicate/delete, reload recovery, multi-document switching, stylus mode and page errors.

```bash
npm i --no-save puppeteer-core @sparticuz/chromium
npm run preview &          # in another terminal
node tests/e2e.mjs http://localhost:4173/
```

Real stylus pressure and palm rejection need real hardware and are checked by hand.

## Deploy (GitHub Pages)

Every push to `main` runs `.github/workflows/deploy.yml`, which builds and publishes `dist/`.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Asset paths are relative (`base: "./"` in `vite.config.js`), so the site works under `/narwhal/` or any other repo name. Excalidraw's fonts are served from this site (`public/fonts`), not a third-party CDN.

**Troubleshooting**
- *Blank page / 404 on assets*: check that Pages source is "GitHub Actions", not "Deploy from a branch".
- *Workflow fails at "configure-pages"*: enable Pages once in Settings, then re-run the workflow.
- *Old version still showing*: hard-refresh (Ctrl/Cmd + Shift + R). Pages caches for about 10 minutes.

## Project structure

```
src/
  App.jsx          UI shell: toolbar, documents, status bar, autosave
  storage.js       IndexedDB persistence + per-browser prefs
  lasso.js         lasso geometry and selection rule (pure functions)
  LassoOverlay.jsx pointer capture for the freehand lasso
  actions.js       stylus buttons, clipboard, image insert, screen capture
  styles.css
tests/e2e.mjs      headless browser test
```

## Collaborators

Shailesh helps maintain the project via GitHub repository permissions. GitHub roles control the *code*. They give no access to anyone's notes, which never leave their own browser.

## Licence

MIT (see `LICENSE`). Includes Excalidraw, © Excalidraw contributors, MIT.
