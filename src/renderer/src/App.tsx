import { useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import TerminalView from './components/Terminal'
import AddHostModal from './components/AddHostModal'
import LockScreen from './components/LockScreen'
import PasswordPrompt from './components/PasswordPrompt'
import type { Profile, Session, VaultStatus } from './types'

export default function App(): JSX.Element | null {
  const [vault, setVault] = useState<VaultStatus | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [importPrompt, setImportPrompt] = useState<{ resolve: (v: string | null) => void } | null>(
    null
  )
  const dragIndex = useRef<number | null>(null)

  useEffect(() => {
    window.api.vault.status().then(setVault)
  }, [])

  function afterUnlock(): void {
    setVault({ exists: true, unlocked: true })
    window.api.profiles.load().then(setProfiles)
  }

  function persist(next: Profile[]): void {
    setProfiles(next)
    window.api.profiles.save(next)
  }

  /** Append " 1"/" 2"/… until the name is unique among the other profiles. */
  function uniqueName(base: string, id: string): string {
    const taken = new Set(profiles.filter((p) => p.id !== id).map((p) => p.name))
    if (!taken.has(base)) return base
    let n = 1
    while (taken.has(`${base} ${n}`)) n++
    return `${base} ${n}`
  }

  function saveProfile(p: Profile): void {
    const named = { ...p, name: uniqueName(p.name, p.id) }
    const exists = profiles.some((x) => x.id === named.id)
    persist(exists ? profiles.map((x) => (x.id === named.id ? named : x)) : [...profiles, named])
  }

  function openAdd(): void {
    setEditing(null)
    setModalOpen(true)
  }
  function openEdit(p: Profile): void {
    setEditing(p)
    setModalOpen(true)
  }
  /** Duplicate a connection (suffixed name) and open the edit modal on the copy. */
  function duplicateProfile(p: Profile): void {
    const id = `p_${Date.now()}`
    setEditing({ ...p, id, name: uniqueName(p.name, id), password: '', hasPassword: false })
    setModalOpen(true)
  }
  function deleteProfile(id: string): void {
    persist(profiles.filter((p) => p.id !== id))
  }

  function connect(profile: Profile): void {
    const id = `s_${Date.now()}`
    setSessions((prev) => [...prev, { id, profile }])
    setActiveId(id)
  }

  function closeSession(id: string): void {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id)
      setActiveId((cur) => (cur === id ? (next[next.length - 1]?.id ?? null) : cur))
      return next
    })
  }

  function reorderTabs(to: number): void {
    const from = dragIndex.current
    dragIndex.current = null
    if (from == null || from === to) return
    setSessions((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  function lock(): void {
    window.api.vault.lock()
    setSessions([])
    setActiveId(null)
    setProfiles([])
    setVault({ exists: true, unlocked: false })
  }

  async function exportConnections(): Promise<void> {
    const r = await window.api.connections.export()
    if (r.ok) window.alert(`Exported ${r.count} connection(s).`)
    else if (!r.canceled && r.error) window.alert(`Export failed: ${r.error}`)
  }

  async function importConnections(): Promise<void> {
    const path = await window.api.connections.pickImport()
    if (!path) return
    let r = await window.api.connections.import(path)
    if (r.needPassword) {
      const pw = await new Promise<string | null>((resolve) => setImportPrompt({ resolve }))
      setImportPrompt(null)
      if (pw == null) return
      r = await window.api.connections.import(path, pw)
    }
    if (r.ok) {
      const list = await window.api.profiles.load()
      setProfiles(list)
      window.alert(`Imported ${r.count} connection(s).`)
    } else {
      window.alert(`Import failed: ${r.error ?? 'unknown error'}`)
    }
  }

  if (!vault) return null
  if (!vault.unlocked) {
    return <LockScreen mode={vault.exists ? 'unlock' : 'setup'} onUnlocked={afterUnlock} />
  }

  return (
    <div className="flex h-screen">
      <Sidebar
        profiles={profiles}
        onConnect={connect}
        onAdd={openAdd}
        onEdit={openEdit}
        onDuplicate={duplicateProfile}
        onDelete={deleteProfile}
        onExport={exportConnections}
        onImport={importConnections}
        onLock={lock}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 items-stretch overflow-x-auto border-b border-border bg-bg-alt">
          {sessions.map((s, i) => (
            <div
              key={s.id}
              draggable
              onClick={() => setActiveId(s.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                connect(s.profile)
              }}
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => reorderTabs(i)}
              title="Right-click to duplicate · drag to reorder"
              className={
                'flex cursor-pointer items-center gap-2 whitespace-nowrap border-r border-border px-3 text-xs ' +
                (s.id === activeId ? 'bg-bg text-content' : 'text-dim hover:text-content')
              }
            >
              <span>{s.profile.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeSession(s.id)
                }}
                className="text-sm opacity-60 hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="relative min-h-0 flex-1 bg-bg">
          {sessions.map((s) => (
            <TerminalView key={s.id} session={s} active={s.id === activeId} />
          ))}
          {sessions.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-dim">
              <h1 className="text-xl text-content">SSH by TeamV</h1>
              <p className="text-sm">Click a connection in the sidebar to start.</p>
            </div>
          )}
        </div>
      </main>

      <AddHostModal
        open={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSave={saveProfile}
      />

      {importPrompt && (
        <PasswordPrompt
          title="Import password"
          message="This file was exported on another machine. Enter the master password it was encrypted with."
          onSubmit={(v) => importPrompt.resolve(v)}
          onCancel={() => importPrompt.resolve(null)}
        />
      )}
    </div>
  )
}
