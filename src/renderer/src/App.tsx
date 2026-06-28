import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import TerminalView from './components/Terminal'
import AddHostModal from './components/AddHostModal'
import type { Profile, Session } from './types'

export default function App(): JSX.Element {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Profile | null>(null)

  useEffect(() => {
    window.api.profiles.load().then(setProfiles)
  }, [])

  function persist(next: Profile[]): void {
    setProfiles(next)
    window.api.profiles.save(next)
  }

  /** Insert a new connection or update an existing one (matched by id). */
  function saveProfile(p: Profile): void {
    const exists = profiles.some((x) => x.id === p.id)
    persist(exists ? profiles.map((x) => (x.id === p.id ? p : x)) : [...profiles, p])
  }

  function openAdd(): void {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(p: Profile): void {
    setEditing(p)
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

  return (
    <div className="flex h-screen">
      <Sidebar
        profiles={profiles}
        onConnect={connect}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={deleteProfile}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Tab bar */}
        <div className="flex h-9 items-stretch overflow-x-auto border-b border-border bg-bg-alt">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => setActiveId(s.id)}
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

        {/* Terminal area */}
        <div className="relative min-h-0 flex-1 bg-bg">
          {sessions.map((s) => (
            <TerminalView key={s.id} session={s} active={s.id === activeId} />
          ))}
          {sessions.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-dim">
              <h1 className="text-xl text-content">SSH by TeamV</h1>
              <p className="text-sm">Double-click a connection in the sidebar to start.</p>
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
    </div>
  )
}
