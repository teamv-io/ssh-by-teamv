import { useState } from 'react'
import type { Profile } from '../types'

interface Props {
  profiles: Profile[]
  onConnect: (profile: Profile) => void
  onAdd: (profile: Profile) => void
  onDelete: (id: string) => void
}

const blank = (): Profile => ({
  id: '',
  name: '',
  host: '',
  port: 22,
  username: '',
  keyPath: ''
})

export default function Sidebar({ profiles, onConnect, onAdd, onDelete }: Props): JSX.Element {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Profile>(blank())

  function submit(e: React.FormEvent): void {
    e.preventDefault()
    if (!draft.host) return
    onAdd({
      ...draft,
      id: `p_${Date.now()}`,
      name: draft.name || draft.host,
      port: Number(draft.port) || 22
    })
    setDraft(blank())
    setAdding(false)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>Sessions</span>
        <button className="icon-btn" onClick={() => setAdding((v) => !v)} title="New session">
          {adding ? '×' : '+'}
        </button>
      </div>

      {adding && (
        <form className="add-form" onSubmit={submit}>
          <input
            placeholder="Name (optional)"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <input
            placeholder="Host *"
            value={draft.host}
            onChange={(e) => setDraft({ ...draft, host: e.target.value })}
          />
          <div className="row">
            <input
              placeholder="User"
              value={draft.username}
              onChange={(e) => setDraft({ ...draft, username: e.target.value })}
            />
            <input
              className="port"
              placeholder="Port"
              value={draft.port}
              onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) || 22 })}
            />
          </div>
          <input
            placeholder="Identity key path (optional)"
            value={draft.keyPath}
            onChange={(e) => setDraft({ ...draft, keyPath: e.target.value })}
          />
          <button type="submit" className="primary-btn">
            Save session
          </button>
        </form>
      )}

      <ul className="profile-list">
        {profiles.map((p) => (
          <li key={p.id} className="profile-item" onDoubleClick={() => onConnect(p)}>
            <div className="profile-info" onClick={() => onConnect(p)}>
              <div className="profile-name">{p.name}</div>
              <div className="profile-sub">
                {p.username ? `${p.username}@` : ''}
                {p.host}
                {p.port !== 22 ? `:${p.port}` : ''}
              </div>
            </div>
            <button
              className="icon-btn delete"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(p.id)
              }}
            >
              🗑
            </button>
          </li>
        ))}
        {profiles.length === 0 && !adding && (
          <li className="empty">No sessions yet. Click + to add one.</li>
        )}
      </ul>
    </aside>
  )
}
