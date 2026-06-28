# SSH by TeamV

A MobaXterm-style SSH client for macOS — a sidebar of saved connections and tabbed,
PTY-backed terminals in one window. Built with **Electron + React + xterm.js**.

![icon](build/icon.svg)

## Features

- 🗂️ **Connections sidebar** — saved SSH hosts with live search
- 🖥️ **Tabbed terminals** — real `xterm.js` terminals backed by `node-pty`
  - Single-click a connection to open a tab
  - Right-click a tab to **duplicate** it, drag tabs to **reorder**
- 🔐 **Per-host auth** — SSH Agent, Password, or Key file (with a native key picker)
- 🔑 **Master-password vault** — credentials are AES-256-GCM encrypted with a
  scrypt-derived key, then wrapped again by the macOS Keychain (`safeStorage`).
  Unlock once per launch.
- 📦 **Encrypted export / import** — back up all connections to a single
  master-password-encrypted `.sshvault` file, portable across machines.
- ✏️ **Add / edit / duplicate** connections; names default to `user@host` and
  auto-suffix `1`, `2`, `3`… on collision.
- 🎨 Tailwind v4 UI, dark theme, standard macOS title bar.

## Development

```bash
pnpm install      # also rebuilds node-pty against Electron's ABI
pnpm run dev      # launch with hot-reload
pnpm run build    # type-check + bundle main / preload / renderer
```

> Requires Node 18+ and Xcode Command Line Tools (for `node-pty`).

## Tech

| Layer | Stack |
|-------|-------|
| Shell | Electron 33 (contextIsolation on, nodeIntegration off) |
| UI | React 18 + Tailwind CSS v4 |
| Terminal | xterm.js + `@xterm/addon-fit` |
| PTY / SSH | `node-pty` spawning the system `ssh` |
| Crypto | Node `crypto` (scrypt + AES-256-GCM) + Electron `safeStorage` |
| Tooling | electron-vite, pnpm |

## Security notes

- Passwords are never sent to the renderer in plaintext — decryption happens in
  the main process at connect time only.
- The master password has **no recovery**: forgetting it means stored passwords
  cannot be decrypted.
- Password-auth connections answer the SSH prompt via the PTY (macOS has no
  `sshpass`). For sturdier password / passphrase / jump-host handling, the SSH
  layer can be moved to the `ssh2` library.

## License

MIT © TeamV
