import { app, shell, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron'
import { join } from 'path'
import { promises as fs, existsSync } from 'fs'
import * as crypto from 'crypto'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'

type AuthMethod = 'agent' | 'password' | 'key'

interface StoredProfile {
  id: string
  name: string
  host: string
  port: number
  username: string
  auth: AuthMethod
  keyPath?: string
  password?: string // encrypted blob ("mk1:" keychain+master, "mk0:" master-only, legacy "enc:"/"b64:")
}

interface VaultMeta {
  v: number
  salt: string // base64
  verifier: string // encrypted "VAULTOK" sentinel
}

const ptys = new Map<string, IPty>()
let mainWindow: BrowserWindow | null = null

/** Master key held only in memory for the unlocked session. */
let masterKey: Buffer | null = null

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
function profilesPath(): string {
  return join(app.getPath('userData'), 'profiles.json')
}
function vaultPath(): string {
  return join(app.getPath('userData'), 'vault.json')
}

// ---------------------------------------------------------------------------
// Crypto: scrypt KDF + AES-256-GCM, optionally wrapped by the OS keychain.
// ---------------------------------------------------------------------------
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
}

function aesEncrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

function aesDecrypt(b64: string, key: Buffer): string {
  const buf = Buffer.from(b64, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ct = buf.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

/** Encrypt with the master key, then wrap with the OS keychain when available. */
function encryptCred(plaintext: string, key: Buffer): string {
  const inner = aesEncrypt(plaintext, key)
  if (safeStorage.isEncryptionAvailable()) {
    return 'mk1:' + safeStorage.encryptString(inner).toString('base64')
  }
  return 'mk0:' + inner
}

function decryptCred(stored: string | undefined, key: Buffer): string | undefined {
  if (!stored) return undefined
  try {
    if (stored.startsWith('mk1:')) {
      const inner = safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
      return aesDecrypt(inner, key)
    }
    if (stored.startsWith('mk0:')) return aesDecrypt(stored.slice(4), key)
    // Legacy (pre-master-password) blobs — keychain only.
    if (stored.startsWith('enc:'))
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
    if (stored.startsWith('b64:')) return Buffer.from(stored.slice(4), 'base64').toString('utf8')
    return stored
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
async function readDisk(): Promise<StoredProfile[]> {
  try {
    return JSON.parse(await fs.readFile(profilesPath(), 'utf-8'))
  } catch {
    return []
  }
}
async function writeDisk(list: StoredProfile[]): Promise<void> {
  await fs.writeFile(profilesPath(), JSON.stringify(list, null, 2), 'utf-8')
}
async function readVault(): Promise<VaultMeta | null> {
  try {
    return JSON.parse(await fs.readFile(vaultPath(), 'utf-8'))
  } catch {
    return null
  }
}

function sanitize(p: StoredProfile): Omit<StoredProfile, 'password'> & { hasPassword: boolean } {
  const { password, ...rest } = p
  return { ...rest, hasPassword: !!password }
}

// ---------------------------------------------------------------------------
// SSH
// ---------------------------------------------------------------------------
function sshArgs(p: StoredProfile): string[] {
  const args = ['-o', 'ServerAliveInterval=30']
  if (p.port && p.port !== 22) args.push('-p', String(p.port))
  if (p.auth === 'key' && p.keyPath) {
    args.push('-i', p.keyPath, '-o', 'PreferredAuthentications=publickey')
  } else if (p.auth === 'password') {
    args.push(
      '-o',
      'PreferredAuthentications=password,keyboard-interactive',
      '-o',
      'PubkeyAuthentication=no',
      '-o',
      'NumberOfPasswordPrompts=1'
    )
  }
  args.push(p.username ? `${p.username}@${p.host}` : p.host)
  return args
}

function createPty(
  id: string,
  profile: StoredProfile,
  password: string | undefined,
  cols: number,
  rows: number
): void {
  const isSsh = !!profile.host
  const shell = isSsh ? 'ssh' : process.env.SHELL || '/bin/zsh'
  const args = isSsh ? sshArgs(profile) : []

  const term = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: app.getPath('home'),
    env: process.env as { [key: string]: string }
  })

  term.onData((data) => mainWindow?.webContents.send('pty:data', { id, data }))
  term.onExit(({ exitCode }) => {
    mainWindow?.webContents.send('pty:exit', { id, exitCode })
    ptys.delete(id)
  })

  if (profile.auth === 'password' && password) {
    let sent = false
    const disposable = term.onData((chunk) => {
      if (sent) return
      if (/password:/i.test(chunk)) {
        sent = true
        term.write(password + '\r')
        disposable.dispose()
      }
    })
  }

  ptys.set(id, term)
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
function registerIpc(): void {
  // --- Vault ---
  ipcMain.handle('vault:status', async () => {
    const v = await readVault()
    return { exists: !!v, unlocked: !!masterKey }
  })

  ipcMain.handle('vault:setup', async (_e, password: string) => {
    if (!password) return { ok: false, error: 'empty' }
    const salt = crypto.randomBytes(16)
    const key = deriveKey(password, salt)
    const meta: VaultMeta = {
      v: 1,
      salt: salt.toString('base64'),
      verifier: encryptCred('VAULTOK', key)
    }
    await fs.writeFile(vaultPath(), JSON.stringify(meta, null, 2), 'utf-8')
    masterKey = key
    return { ok: true }
  })

  ipcMain.handle('vault:unlock', async (_e, password: string) => {
    const v = await readVault()
    if (!v) return { ok: false, error: 'no-vault' }
    const key = deriveKey(password, Buffer.from(v.salt, 'base64'))
    if (decryptCred(v.verifier, key) === 'VAULTOK') {
      masterKey = key
      return { ok: true }
    }
    return { ok: false, error: 'wrong-password' }
  })

  ipcMain.handle('vault:lock', () => {
    masterKey = null
    return { ok: true }
  })

  // --- Profiles ---
  ipcMain.handle('profiles:load', async () => {
    if (!masterKey) return []
    return (await readDisk()).map(sanitize)
  })

  ipcMain.handle('profiles:save', async (_e, incoming: StoredProfile[]) => {
    if (!masterKey) return
    const existing = await readDisk()
    const byId = new Map(existing.map((p) => [p.id, p]))

    const merged: StoredProfile[] = incoming.map((p) => {
      const prev = byId.get(p.id)
      let password: string | undefined
      if (p.auth === 'password') {
        password =
          p.password && p.password.length > 0
            ? encryptCred(p.password, masterKey!)
            : prev?.password
      }
      const clean: StoredProfile = {
        id: p.id,
        name: p.name,
        host: p.host,
        port: p.port,
        username: p.username,
        auth: p.auth,
        keyPath: p.keyPath
      }
      if (password) clean.password = password
      return clean
    })

    await writeDisk(merged)
  })

  // --- Export / Import (encrypted with the master password) ---
  ipcMain.handle('connections:export', async () => {
    if (!masterKey) return { ok: false, error: 'locked' }
    const v = await readVault()
    if (!v) return { ok: false, error: 'no-vault' }

    // Decrypt local (keychain-bound) secrets to plaintext, then re-encrypt the
    // whole bundle with the master key only — so it is portable to any machine.
    const disk = await readDisk()
    const plain = disk.map((p) => {
      const { password, ...rest } = p
      const pw = password ? decryptCred(password, masterKey!) : undefined
      return pw ? { ...rest, password: pw } : { ...rest }
    })

    const bundle = {
      format: 'ssh-by-teamv',
      v: 1,
      salt: v.salt,
      data: aesEncrypt(JSON.stringify(plain), masterKey)
    }

    const res = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export connections',
      defaultPath: join(app.getPath('downloads'), 'connections.sshvault'),
      filters: [{ name: 'SSH Vault', extensions: ['sshvault'] }]
    })
    if (res.canceled || !res.filePath) return { ok: false, canceled: true }
    await fs.writeFile(res.filePath, JSON.stringify(bundle, null, 2), 'utf-8')
    return { ok: true, path: res.filePath, count: plain.length }
  })

  ipcMain.handle('dialog:pickImport', async () => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      title: 'Import connections',
      properties: ['openFile'],
      filters: [{ name: 'SSH Vault', extensions: ['sshvault', 'json'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    return res.filePaths[0]
  })

  ipcMain.handle('connections:import', async (_e, { path, password }) => {
    if (!masterKey) return { ok: false, error: 'locked' }
    let bundle: { salt?: string; data?: string }
    try {
      bundle = JSON.parse(await fs.readFile(path, 'utf-8'))
    } catch {
      return { ok: false, error: 'unreadable' }
    }
    if (!bundle?.data || !bundle?.salt) return { ok: false, error: 'invalid' }

    // Same machine + same master password → in-memory key works directly.
    // Otherwise re-derive from the supplied password using the bundle's salt.
    const key = password ? deriveKey(password, Buffer.from(bundle.salt, 'base64')) : masterKey

    let plain: StoredProfile[]
    try {
      plain = JSON.parse(aesDecrypt(bundle.data, key))
    } catch {
      return password ? { ok: false, error: 'wrong-password' } : { ok: false, needPassword: true }
    }
    if (!Array.isArray(plain)) return { ok: false, error: 'invalid' }

    const existing = await readDisk()
    const byId = new Map(existing.map((p) => [p.id, p]))
    for (const p of plain) {
      const clean: StoredProfile = {
        id: p.id,
        name: p.name,
        host: p.host,
        port: p.port,
        username: p.username,
        auth: p.auth,
        keyPath: p.keyPath
      }
      if (p.auth === 'password' && p.password) clean.password = encryptCred(p.password, masterKey!)
      byId.set(clean.id, clean)
    }
    await writeDisk(Array.from(byId.values()))
    return { ok: true, count: plain.length }
  })

  // --- Dialog ---
  ipcMain.handle('dialog:pickKey', async () => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      title: 'Select SSH private key',
      defaultPath: join(app.getPath('home'), '.ssh'),
      properties: ['openFile', 'showHiddenFiles', 'dontAddToRecent']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  // --- PTY ---
  ipcMain.on('pty:create', async (_e, { id, profile, cols, rows }) => {
    const disk = await readDisk()
    const stored = disk.find((p) => p.id === profile.id)
    const password = stored && masterKey ? decryptCred(stored.password, masterKey) : undefined
    createPty(id, { ...(stored ?? profile), ...profile } as StoredProfile, password, cols, rows)
  })

  ipcMain.on('pty:write', (_e, { id, data }) => ptys.get(id)?.write(data))
  ipcMain.on('pty:resize', (_e, { id, cols, rows }) => {
    try {
      ptys.get(id)?.resize(cols, rows)
    } catch {
      /* pty may have just exited */
    }
  })
  ipcMain.on('pty:kill', (_e, { id }) => {
    ptys.get(id)?.kill()
    ptys.delete(id)
  })
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'SSH by TeamV',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Dev dock icon (packaged builds get the icon from the .app bundle).
  if (process.platform === 'darwin' && app.dock) {
    const iconPng = join(__dirname, '../../build/icon.png')
    if (existsSync(iconPng)) app.dock.setIcon(iconPng)
  }
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  ptys.forEach((p) => p.kill())
  ptys.clear()
  masterKey = null
  if (process.platform !== 'darwin') app.quit()
})
