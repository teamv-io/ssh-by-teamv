import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import TerminalView from './components/Terminal'
import type { Profile, Session } from './types'

export default function App(): JSX.Element {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

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
      setActiveId((cur) => (cur === id ? next[next.length - 1]?.id ?? null : cur))
      return next
    })
  }

  return (
    <div className="app">
      <Sidebar
        profiles={profiles}
        onConnect={connect}
        onAdd={addProfile}
        onDelete={deleteProfile}
      />

      <main className="main">
        <div className="tabbar">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`tab ${s.id === activeId ? 'active' : ''}`}
              onClick={() => setActiveId(s.id)}
            >
              <span className="tab-title">{s.profile.name}</span>
              <button
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  closeSession(s.id)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="terminal-area">
          {sessions.map((s) => (
            <TerminalView key={s.id} session={s} active={s.id === activeId} />
          ))}
          {sessions.length === 0 && (
            <div className="welcome">
              <h1>SSH by TeamV</h1>
              <p>Double-click a session in the sidebar to connect.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
