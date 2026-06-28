import { app, shell, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'

type AuthMethod = 'agent' | 'password' | 'key'

/** Shape persisted to disk — password is stored encrypted. */
interface StoredProfile {
  id: string
  name: string
  host: string
  port: number
  username: string
  auth: AuthMethod
  keyPath?: string
  password?: string // encrypted blob ("enc:..." or "b64:...")
}

const ptys = new Map<string, IPty>()
let mainWindow: BrowserWindow | null = null

function profilesPath(): string {
  return join(app.getPath('userData'), 'profiles.json')
}

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

function encryptPw(pw: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(pw).toString('base64')
  }
  return 'b64:' + Buffer.from(pw, 'utf-8').toString('base64')
}

function decryptPw(stored?: string): string | undefined {
  if (!stored) return undefined
  if (stored.startsWith('enc:')) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
    } catch {
      return undefined
    }
  }
  if (stored.startsWith('b64:')) return Buffer.from(stored.slice(4), 'base64').toString('utf-8')
  return stored
}

/** Strip the secret before handing a profile to the renderer. */
function sanitize(p: StoredProfile): Omit<StoredProfile, 'password'> & { hasPassword: boolean } {
  const { password, ...rest } = p
  return { ...rest, hasPassword: !!password }
}

/** Build the ssh argument list from a profile + chosen auth method. */
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

  const target = p.username ? `${p.username}@${p.host}` : p.host
  args.push(target)
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

  // Auto-answer the SSH password prompt when password auth is used.
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

function registerIpc(): void {
  ipcMain.handle('profiles:load', async () => (await readDisk()).map(sanitize))

  ipcMain.handle('profiles:save', async (_e, incoming: (StoredProfile & { hasPassword?: boolean })[]) => {
    const existing = await readDisk()
    const byId = new Map(existing.map((p) => [p.id, p]))

    const merged: StoredProfile[] = incoming.map((p) => {
      const prev = byId.get(p.id)
      let password: string | undefined
      if (p.auth === 'password') {
        // Keep the previously stored secret unless the user typed a new one.
        password = p.password && p.password.length > 0 ? encryptPw(p.password) : prev?.password
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

  ipcMain.handle('dialog:pickKey', async () => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      title: 'Select SSH private key',
      defaultPath: join(app.getPath('home'), '.ssh'),
      properties: ['openFile', 'showHiddenFiles', 'dontAddToRecent']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return res.filePaths[0]
  })

  ipcMain.on('pty:create', async (_e, { id, profile, cols, rows }) => {
    const disk = await readDisk()
    const stored = disk.find((p) => p.id === profile.id)
    const password = stored ? decryptPw(stored.password) : undefined
    // Trust the live auth/keyPath/host from the renderer, secret from disk.
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
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  ptys.forEach((p) => p.kill())
  ptys.clear()
  if (process.platform !== 'darwin') app.quit()
})
