export type AuthMethod = 'agent' | 'password' | 'key'

export interface Profile {
  id: string
  name: string
  host: string
  port: number
  username: string
  auth: AuthMethod
  keyPath?: string
  /** Plaintext only while creating/editing in the UI; never persisted to the renderer. */
  password?: string
  /** True when an encrypted password is stored on disk for this profile. */
  hasPassword?: boolean
}

export interface Session {
  id: string
  profile: Profile
}

export interface VaultStatus {
  exists: boolean
  unlocked: boolean
}

declare global {
  interface Window {
    api: {
      vault: {
        status: () => Promise<VaultStatus>
        setup: (password: string) => Promise<{ ok: boolean; error?: string }>
        unlock: (password: string) => Promise<{ ok: boolean; error?: string }>
        lock: () => Promise<{ ok: boolean }>
      }
      connections: {
        export: () => Promise<{ ok: boolean; path?: string; count?: number; error?: string }>
        pickImport: () => Promise<string | null>
        import: (
          path: string,
          password?: string
        ) => Promise<{ ok: boolean; count?: number; needPassword?: boolean; error?: string }>
      }
      profiles: {
        load: () => Promise<Profile[]>
        save: (profiles: Profile[]) => Promise<void>
      }
      dialog: {
        pickKey: () => Promise<string | null>
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
