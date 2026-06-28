import { useMemo, useState } from 'react'
import type { Profile } from '../types'

interface Props {
  profiles: Profile[]
  onConnect: (profile: Profile) => void
  onAdd: () => void
  onEdit: (profile: Profile) => void
  onDuplicate: (profile: Profile) => void
  onDelete: (id: string) => void
  onExport: () => void
  onImport: () => void
  onLock: () => void
}

export default function Sidebar({
  profiles,
  onConnect,
  onAdd,
  onEdit,
  onDuplicate,
  onDelete,
  onExport,
  onImport,
  onLock
}: Props): JSX.Element {
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
        <span className="text-xs font-semibold uppercase tracking-wider text-dim">
          Connections
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onLock}
            title="Lock vault"
            className="grid h-6 w-6 place-items-center rounded text-xs text-dim hover:bg-surface hover:text-content"
          >
            🔒
          </button>
          <button
            onClick={onAdd}
            title="New connection"
            className="grid h-6 w-6 place-items-center rounded text-base text-dim hover:bg-surface hover:text-content"
          >
            +
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search connections…"
          className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-content outline-none placeholder:text-dim/60 focus:border-accent"
        />
      </div>

      <ul className="flex-1 overflow-y-auto">
        {filtered.map((p) => (
          <li
            key={p.id}
            onClick={() => onConnect(p)}
            onContextMenu={(e) => {
              e.preventDefault()
              onDuplicate(p)
            }}
            title={`${p.username ? `${p.username}@` : ''}${p.host}${p.port !== 22 ? `:${p.port}` : ''}  ·  right-click to duplicate`}
            className="group flex cursor-pointer items-center gap-2 border-b border-border/40 px-3 py-2 hover:bg-surface"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-content">{p.name}</span>

            <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
              <button
                title="Edit"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(p)
                }}
                className="rounded px-1 text-xs text-dim hover:text-accent"
              >
                ✎
              </button>
              <button
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(p.id)
                }}
                className="rounded px-1 text-xs text-dim hover:text-danger"
              >
                ✕
              </button>
            </div>
          </li>
        ))}

        {filtered.length === 0 && (
          <li className="px-3.5 py-4 text-xs text-dim">
            {profiles.length === 0 ? 'No connections yet. Click + to add one.' : 'No matches.'}
          </li>
        )}
      </ul>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-[11px] text-dim">
        <button onClick={onImport} className="hover:text-content" title="Import from file">
          Import
        </button>
        <span className="opacity-40">·</span>
        <button onClick={onExport} className="hover:text-content" title="Export to file">
          Export
        </button>
      </div>
    </aside>
  )
}
