import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'

interface Profile {
  id: string
  name: string
  host: string
  port: number
  username: string
  keyPath?: string
}

const ptys = new Map<string, IPty>()
let mainWindow: BrowserWindow | null = null

function profilesPath(): string {
  return join(app.getPath('userData'), 'profiles.json')
}

async function loadProfiles(): Promise<Profile[]> {
  try {
    const raw = await fs.readFile(profilesPath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function saveProfiles(profiles: Profile[]): Promise<void> {
  await fs.writeFile(profilesPath(), JSON.stringify(profiles, null, 2), 'utf-8')
}

/** Build the ssh argument list from a profile. */
function sshArgs(profile: Profile): string[] {
  const args: string[] = []
  if (profile.port && profile.port !== 22) args.push('-p', String(profile.port))
  if (profile.keyPath) args.push('-i', profile.keyPath)
  // Keep the connection responsive and avoid host-key prompts hanging the pty.
  args.push('-o', 'ServerAliveInterval=30')
  const target = profile.username ? `${profile.username}@${profile.host}` : profile.host
  args.push(target)
  return args
}

function createPty(id: string, profile: Profile, cols: number, rows: number): void {
  const shell = profile.host ? 'ssh' : process.env.SHELL || '/bin/zsh'
  const args = profile.host ? sshArgs(profile) : []

  const term = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd: app.getPath('home'),
    env: process.env as { [key: string]: string }
  })

  term.onData((data) => {
    mainWindow?.webContents.send('pty:data', { id, data })
  })

  term.onExit(({ exitCode }) => {
    mainWindow?.webContents.send('pty:exit', { id, exitCode })
    ptys.delete(id)
  })

  ptys.set(id, term)
}

function registerIpc(): void {
  ipcMain.handle('profiles:load', () => loadProfiles())
  ipcMain.handle('profiles:save', (_e, profiles: Profile[]) => saveProfiles(profiles))

  ipcMain.on('pty:create', (_e, { id, profile, cols, rows }) => {
    createPty(id, profile, cols, rows)
  })

  ipcMain.on('pty:write', (_e, { id, data }) => {
    ptys.get(id)?.write(data)
  })

  ipcMain.on('pty:resize', (_e, { id, cols, rows }) => {
    try {
      ptys.get(id)?.resize(cols, rows)
    } catch {
      /* resize can throw if the pty just exited */
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
    titleBarStyle: 'hiddenInset',
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
