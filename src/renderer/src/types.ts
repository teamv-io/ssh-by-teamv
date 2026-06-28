export interface Profile {
  id: string
  name: string
  host: string
  port: number
  username: string
  keyPath?: string
}

export interface Session {
  id: string
  profile: Profile
}

declare global {
  interface Window {
    api: {
      profiles: {
        load: () => Promise<Profile[]>
        save: (profiles: Profile[]) => Promise<void>
      }
      pty: {
        create: (id: string, profile: Profile, cols: number, rows: number) => void
        write: (id: string, data: string) => void
        resize: (id: string, cols: number, rows: number) => void
        kill: (id: string) => void
        onData: (id: string, cb: (data: string) => void) => () => void
        onExit: (id: string, cb: (exitCode: number) => void) => () => void
      }
    }
  }
}
