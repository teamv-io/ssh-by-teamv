import { useMemo, useState } from 'react'
import type { Profile } from '../types'

interface Props {
  profiles: Profile[]
  onConnect: (profile: Profile) => void
  onAdd: () => void
  onDelete: (id: string) => void
}

const AUTH_BADGE: Record<Profile['auth'], string> = {
  agent: 'agent',
  password: 'pwd',
  key: 'key'
}

export default function Sidebar({ profiles, onConnect, onAdd, onDelete }: Props): JSX.Element {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return profiles
    return profiles.filter((p) =>
      [p.name, p.host, p.username].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [profiles, query])

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-bg-alt">
      <div className="flex items-center justify-between px-3.5 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-dim">Sessions</span>
        <button
          onClick={onAdd}
          title="New session"
          className="grid h-6 w-6 place-items-center rounded text-base text-dim hover:bg-surface hover:text-content"
        >
          +
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sessions…"
          className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-content outline-none placeholder:text-dim/60 focus:border-accent"
        />
      </div>

      <ul className="flex-1 overflow-y-auto">
        {filtered.map((p) => (
          <li
            key={p.id}
            onClick={() => onConnect(p)}
            onDoubleClick={() => onConnect(p)}
            className="group flex cursor-pointer items-center gap-2 border-b border-border/40 px-3 py-2 hover:bg-surface"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-content">{p.name}</span>
                <span className="rounded bg-overlay/60 px-1 py-px text-[9px] uppercase text-dim">
                  {AUTH_BADGE[p.auth]}
                </span>
              </div>
              <div className="truncate text-[11px] text-dim">
                {p.username ? `${p.username}@` : ''}
                {p.host}
                {p.port !== 22 ? `:${p.port}` : ''}
              </div>
            </div>
            <button
              title="Delete"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(p.id)
              }}
              className="shrink-0 rounded px-1 text-xs text-dim opacity-0 hover:text-danger group-hover:opacity-100"
            >
              ✕
            </button>
          </li>
        ))}

        {filtered.length === 0 && (
          <li className="px-3.5 py-4 text-xs text-dim">
            {profiles.length === 0 ? 'No sessions yet. Click + to add one.' : 'No matches.'}
          </li>
        )}
      </ul>
    </aside>
  )
}
