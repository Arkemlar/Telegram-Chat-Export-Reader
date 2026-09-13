# Telegram Chat Export Reader — notes for AI assistants

Client-side viewer for Telegram Desktop **HTML** exports (Chat → Export chat history → HTML).
Fork of https://github.com/EmerickGrimm/Telegram-Chat-Export-Reader (git remote `upstream`);
this fork is `origin` (https://github.com/Arkemlar/Telegram-Chat-Export-Reader).

## Stack

React 18 + Vite 4.3.9 (rollup pinned to 3.29.5), Tailwind 3, lucide-react 0.263 (icons),
lottie-react + pako (animated `.tgs` stickers), highlight.js. Plain JS/JSX, no TypeScript, no tests.

## Running

- Dev: `npm install && npm run dev` → http://localhost:3000/Telegram-Chat-Export-Reader/
  (`vite.config.js` has `base` for the upstream GitHub Pages deploy — keep it).
- Docker (the way this fork is used): `Dockerfile` builds with `vite build --base=/` and serves `dist`
  via nginx (`nginx.conf`). The export folder must be mounted read-only at `/chat`; nginx serves it at
  `/chat/` with `autoindex_format json`. Open **http://localhost:8080/?chat=/chat/** to auto-load it.

The export folder path lives **only** in a local docker-compose file kept outside this repo.
Never commit chat exports, their folder names or any chat content. Compose shape:

```yaml
services:
  tg-reader:
    build: ./app                      # path to this repo
    ports: ["8080:80"]
    volumes:
      - "./<export folder>:/chat:ro"
    restart: unless-stopped
```

Rebuild after code changes: `docker compose up -d --build` (from the folder with the compose file).

## Loading pipeline

- `src/App.jsx` — two entry points, both end in `loadChat(files, basePath)`:
  - folder picker (`<input webkitdirectory>`, works in Firefox/Chromium) → real `File`s;
  - `?chat=<url>` → `listRemoteFolder` (`utils/fileHandler.js`) walks the nginx JSON listing and returns
    file-like objects `{ name, webkitRelativePath, url, text() }`.
  `loadChat` reads all pages `messages.html, messages2.html, …` (sorted), parses `.message` elements in
  batches of 100, then links replies to quoted messages. It also builds `voiceTracks` (playlist).
- `src/utils/parser.js` — one DOM `.message` → `{ id, type: 'service'|'message', from, time, date, text,
  formattedHTML, replyTo, media[], initials, userpicClass }`. Media URLs are resolved via
  `findFileInFolder` (object URL for `File`, `url` for remote objects).

Export format facts:
- ids are `message123`; replies link `#go_to_message123` or `messages2.html#go_to_message123`;
- `.date` has `title="30.12.2023 23:26:26 UTC+03:00"` (the text is only `23:26`);
- "joined" messages (same sender in a row) have no `.from_name` → `from === ''`;
- day separators are service messages with text like `20 October 2023` and no date;
- `img.src` in a `DOMParser` document resolves to an absolute URL, so thumbnail lookups by `img.src`
  never match (known limitation; full media is used instead).

## UI components

- `MessageList.jsx` — custom virtualization: only items near the viewport are mounted; heights are measured
  with `offsetHeight` (excludes margins, `ESTIMATED_HEIGHT` = 160 until measured), so estimated positions
  drift. Anything that needs real positions must measure the DOM (items carry `data-index`).
  Also renders the pinned day badge (`ru-RU` full date of the topmost visible message; recomputed after
  every render and on `ResizeObserver`).
- Items unmount when scrolled away — do not keep long-lived state (e.g. playback) inside messages.
- `context/VoicePlayerContext.jsx` — the single app-wide `Audio` element: one voice at a time, survives
  scrolling, auto-advances to the next voice, speed 1–2× step 0.25 persisted in
  `localStorage.voicePlaybackRate` (set `defaultPlaybackRate` too — a new `src` resets `playbackRate`).
- `VoicePlayerBar.jsx` — Telegram-style player under the header (prev/play/next, seek, speed, close).
- `AudioMessage.jsx` — in-message voice widget; only a view over the context.
- `MediaItem.jsx` (all media types), `MediaViewer.jsx` (fullscreen gallery), `FormattedText.jsx`
  (export HTML, spoilers, code highlighting), `ChatHeader.jsx`, `EmptyState.jsx`.
- Dark mode = `.dark` class on `<html>` + overrides in `App.css` for specific Tailwind classes; prefer
  classes that already have an override (`bg-white`, `border-gray-200`, `text-gray-*`, `shadow-sm`, …).

## Verifying changes

No test suite: rebuild the container and check the page in a browser. When scripting the page, setting
`scrollTop` may not emit `scroll` if the browser pane is hidden — dispatch
`new Event('scroll')` on the list container (`.overscroll-y-contain`) to make the virtual list update.
