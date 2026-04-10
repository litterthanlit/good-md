# Houston

A native macOS markdown reader. Lightweight, fast, and beautiful.

Built with [Tauri v2](https://v2.tauri.app) + [React 19](https://react.dev) + TypeScript.

## Features

- **Full GFM + MDX** --- tables, task lists, footnotes, strikethrough, autolinks
- **Syntax highlighting** --- 190+ languages via highlight.js with automatic detection
- **Session persistence** --- remembers open files, active document, and scroll positions
- **Folder watching** --- open entire directories, auto-detect file changes in real time
- **Drag & drop** --- drop files into the window with visual feedback
- **Keyboard first** --- `Cmd+O` open, `Cmd+Shift+O` folder, `Cmd+W` close, arrow keys navigate
- **Light & dark** --- follows system appearance with tuned palettes for both modes
- **Scroll memory** --- per-file scroll position preserved when switching documents
- **Instant launch** --- ~3.3 MB on disk, ~30 MB RAM at idle

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
| Storage  | @tauri-apps/plugin-store      |

## Architecture

```
src/
  components/    # Sidebar, ReaderPane, MarkdownRenderer, EmptyState
  hooks/         # useFileManager, useKeyboardShortcuts
  lib/           # types, commands, store helpers
  styles/        # theme, markdown, sidebar, code-theme
src-tauri/
  src/           # Rust backend: file reading, folder watching
```

## License

MIT
