import { useEffect, useRef, useState } from 'react'
import type { AuthMethod, Profile } from '../types'

interface Props {
  open: boolean
  /** When set, the dialog edits this profile instead of creating a new one. */
  initial?: Profile | null
  onClose: () => void
  onSave: (profile: Profile) => void
}

const blank = (): Profile => ({
  id: '',
  name: '',
  host: '',
  port: 22,
  username: '',
  auth: 'agent',
  keyPath: '',
  password: ''
})

const AUTH_OPTIONS: { value: AuthMethod; label: string }[] = [
  { value: 'agent', label: 'SSH Agent' },
  { value: 'password', label: 'Password' },
  { value: 'key', label: 'Key file' }
]

const fieldCls =
  'w-full rounded-md bg-surface border border-border px-2.5 py-1.5 text-sm text-content ' +
  'outline-none placeholder:text-dim/60 focus:border-accent'

const labelCls = 'flex flex-col gap-1 text-xs text-dim'

export default function AddHostModal({ open, initial, onClose, onSave }: Props): JSX.Element | null {
  const [draft, setDraft] = useState<Profile>(blank())
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const isEdit = !!initial

  // Seed the form whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setDraft(initial ? { ...initial, password: '' } : blank())
      setTimeout(() => firstFieldRef.current?.focus(), 0)
    }
  }, [open, initial])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function submit(e: React.FormEvent): void {
    e.preventDefault()
    const host = draft.host.trim()
    if (!host) return
    const user = draft.username.trim()
    // Default the name to user@host (App uniquifies with a 1/2/3 suffix).
    const name = draft.name.trim() || (user ? `${user}@${host}` : host)
    onSave({
      ...draft,
      id: initial?.id ?? `p_${Date.now()}`,
      name,
      host,
      username: user,
      keyPath: draft.auth === 'key' ? draft.keyPath?.trim() || undefined : undefined,
      // Empty password on an existing password-host means "keep the saved one".
      password: draft.auth === 'password' ? draft.password : undefined,
      port: Number(draft.port) || 22
    })
    onClose()
  }

  async function browseKey(): Promise<void> {
    const path = await window.api.dialog.pickKey()
    if (path) setDraft((d) => ({ ...d, keyPath: path }))
  }

  const passwordKept = isEdit && initial?.auth === 'password' && initial?.hasPassword

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        className="w-[420px] max-w-[92vw] rounded-xl border border-border bg-bg-alt shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-content">
            {isEdit ? 'Edit Connection' : 'New Connection'}
          </h2>
          <button
            className="grid h-6 w-6 place-items-center rounded text-dim hover:bg-surface hover:text-content"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form className="flex flex-col gap-3 p-4" onSubmit={submit}>
          <label className={labelCls}>
            Name
            <input
              className={fieldCls}
              placeholder="e.g. Production web"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>

          <label className={labelCls}>
            Host *
            <input
              ref={firstFieldRef}
              className={fieldCls}
              placeholder="example.com or 10.0.0.5"
              value={draft.host}
              onChange={(e) => setDraft({ ...draft, host: e.target.value })}
            />
          </label>

          <div className="flex gap-3">
            <label className={`${labelCls} flex-1`}>
              Username
              <input
                className={fieldCls}
                placeholder="root"
                value={draft.username}
                onChange={(e) => setDraft({ ...draft, username: e.target.value })}
              />
            </label>
            <label className={`${labelCls} w-20`}>
              Port
              <input
                className={fieldCls}
                value={draft.port}
                onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) || 22 })}
              />
            </label>
          </div>

          <div className={labelCls}>
            Authentication
            <div className="flex gap-1 rounded-md bg-surface p-1">
              {AUTH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDraft({ ...draft, auth: opt.value })}
                  className={
                    'flex-1 rounded px-2 py-1 text-xs font-medium transition ' +
                    (draft.auth === opt.value
                      ? 'bg-accent text-[#11111b]'
                      : 'text-dim hover:text-content')
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {draft.auth === 'password' && (
            <label className={labelCls}>
              Password
              <input
                type="password"
                className={fieldCls}
                placeholder={passwordKept ? '•••••••• (unchanged)' : '••••••••'}
                value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              />
              <span className="text-[10px] text-dim/70">
                {passwordKept
                  ? 'Leave blank to keep the saved password. Stored encrypted via the macOS Keychain.'
                  : 'Stored encrypted via the macOS Keychain.'}
              </span>
            </label>
          )}

          {draft.auth === 'key' && (
            <label className={labelCls}>
              Private key
              <div className="flex gap-2">
                <input
                  className={fieldCls}
                  placeholder="~/.ssh/id_ed25519"
                  value={draft.keyPath}
                  onChange={(e) => setDraft({ ...draft, keyPath: e.target.value })}
                />
                <button
                  type="button"
                  onClick={browseKey}
                  className="shrink-0 rounded-md border border-border bg-surface px-3 text-xs text-content hover:border-accent"
                >
                  Browse…
                </button>
              </div>
            </label>
          )}

          {draft.auth === 'agent' && (
            <p className="text-[11px] text-dim/80">
              Uses your running ssh-agent / default keys — no extra credentials needed.
            </p>
          )}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-dim hover:text-content"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!draft.host.trim()}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-[#11111b] disabled:opacity-40"
            >
              {isEdit ? 'Save changes' : 'Save connection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
