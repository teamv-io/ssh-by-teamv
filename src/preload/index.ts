import { contextBridge, ipcRenderer } from 'electron'

type AuthMethod = 'agent' | 'password' | 'key'

export interface Profile {
  id: string
  name: string
  host: string
  port: number
  username: string
  auth: AuthMethod
  keyPath?: string
  password?: string
  hasPassword?: boolean
}

const api = {
  profiles: {
    load: (): Promise<Profile[]> => ipcRenderer.invoke('profiles:load'),
    save: (profiles: Profile[]): Promise<void> => ipcRenderer.invoke('profiles:save', profiles)
  },
  dialog: {
    pickKey: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickKey')
  },
  pty: {
    create: (id: string, profile: Profile, cols: number, rows: number): void =>
      ipcRenderer.send('pty:create', { id, profile, cols, rows }),
    write: (id: string, data: string): void => ipcRenderer.send('pty:write', { id, data }),
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send('pty:resize', { id, cols, rows }),
    kill: (id: string): void => ipcRenderer.send('pty:kill', { id }),
    onData: (id: string, cb: (data: string) => void): (() => void) => {
      const listener = (_e: unknown, payload: { id: string; data: string }): void => {
        if (payload.id === id) cb(payload.data)
      }
      ipcRenderer.on('pty:data', listener)
      return () => ipcRenderer.removeListener('pty:data', listener)
    },
    onExit: (id: string, cb: (exitCode: number) => void): (() => void) => {
      const listener = (_e: unknown, payload: { id: string; exitCode: number }): void => {
        if (payload.id === id) cb(payload.exitCode)
      }
      ipcRenderer.on('pty:exit', listener)
      return () => ipcRenderer.removeListener('pty:exit', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
