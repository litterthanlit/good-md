# Houston-MD

A local-first macOS Markdown and PDF reader/editor. Lightweight, fast, and calm on purpose.

Built with [Tauri v2](https://v2.tauri.app) + [React 19](https://react.dev) + TypeScript.

## Features

- **Markdown reading and editing** --- source editing, preview, outline, search, save, and dirty-state protection
- **PDF reading and overlay editing** --- rendered pages, selectable-text search, highlights, notes, overlay text, whiteout, rotation, deletion, and reorder-on-save
- **Full GFM + MDX** --- tables, task lists, footnotes, strikethrough, autolinks
- **Syntax highlighting** --- 190+ languages via highlight.js with automatic detection
- **Session persistence** --- remembers open files, active document, and scroll positions
- **Folder watching** --- open entire directories, search documents, and auto-detect file changes in real time
- **Drag & drop** --- drop files into the window with visual feedback
- **Keyboard first** --- `Cmd+O` open, `Cmd+F` search, `Cmd+K` palette, `Cmd+E` edit mode, `Cmd+S` save
- **Light & dark** --- follows system appearance with tuned palettes for both modes
- **Scroll memory** --- per-file scroll position preserved when switching documents

## Install

Download the latest `.dmg` from [Releases](https://github.com/litterthanlit/good-md/releases).

## Development

```bash
# install dependencies
npm install

# run in dev mode
npm run tauri dev

# build for production
npm run tauri build
```

## Tech Stack

| Layer    | Tech                          |
|----------|-------------------------------|
| Shell    | Tauri v2 (Rust + WebKit)      |
| Frontend | React 19, TypeScript, Vite 6  |
| Markdown | react-markdown, remark-gfm, rehype-highlight |
| PDF      | pdfjs-dist, pdf-lib              |
| Storage  | @tauri-apps/plugin-store      |

## Architecture

```
src/
  components/    # Sidebar, ReaderPane, PdfPane, MarkdownRenderer, EmptyState
  hooks/         # useFileManager, useKeyboardShortcuts
  lib/           # types, commands, store helpers
  styles/        # theme, markdown, sidebar, code-theme
src-tauri/
  src/           # Rust backend: file reading, folder watching
```

## License

MIT
