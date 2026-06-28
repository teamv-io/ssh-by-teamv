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

  useEffect(() => {
    window.api.profiles.load().then(setProfiles)
  }, [])

  function persist(next: Profile[]): void {
    setProfiles(next)
    window.api.profiles.save(next)
  }

  function addProfile(p: Profile): void {
    persist([...profiles, p])
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
        onAdd={() => setModalOpen(true)}
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
              <p className="text-sm">Double-click a session in the sidebar to connect.</p>
            </div>
          )}
        </div>
      </main>

      <AddHostModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={addProfile} />
    </div>
  )
}
