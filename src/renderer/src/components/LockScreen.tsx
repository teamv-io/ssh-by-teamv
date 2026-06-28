import { useEffect, useRef, useState } from 'react'

interface Props {
  mode: 'setup' | 'unlock'
  onUnlocked: () => void
}

const fieldCls =
  'w-full rounded-md bg-surface border border-border px-3 py-2 text-sm text-content ' +
  'outline-none placeholder:text-dim/60 focus:border-accent'

export default function LockScreen({ mode, onUnlocked }: Props): JSX.Element {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setErr('')
    if (mode === 'setup') {
      if (pw.length < 4) return setErr('Use at least 4 characters.')
      if (pw !== confirm) return setErr('Passwords do not match.')
      setBusy(true)
      const r = await window.api.vault.setup(pw)
      setBusy(false)
      if (r.ok) onUnlocked()
      else setErr('Could not create the vault.')
    } else {
      setBusy(true)
      const r = await window.api.vault.unlock(pw)
      setBusy(false)
      if (r.ok) onUnlocked()
      else setErr('Wrong master password.')
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-bg">
      <form
        onSubmit={submit}
        className="w-[360px] max-w-[92vw] rounded-xl border border-border bg-bg-alt p-6 shadow-2xl"
      >
        <div className="mb-1 text-center text-lg font-semibold text-content">SSH by TeamV</div>
        <p className="mb-5 text-center text-xs text-dim">
          {mode === 'setup'
            ? 'Create a master password to encrypt your saved credentials.'
            : 'Enter your master password to unlock your connections.'}
        </p>

        <label className="mb-3 flex flex-col gap-1 text-xs text-dim">
          {mode === 'setup' ? 'Master password' : 'Master password'}
          <input
            ref={ref}
            type="password"
            className={fieldCls}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        {mode === 'setup' && (
          <label className="mb-3 flex flex-col gap-1 text-xs text-dim">
            Confirm password
            <input
              type="password"
              className={fieldCls}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
            />
          </label>
        )}

        {err && <div className="mb-3 text-xs text-danger">{err}</div>}

        <button
          type="submit"
          disabled={busy || !pw}
          className="w-full rounded-md bg-accent py-2 text-sm font-semibold text-[#11111b] disabled:opacity-40"
        >
          {mode === 'setup' ? 'Create vault' : 'Unlock'}
        </button>

        {mode === 'setup' && (
          <p className="mt-3 text-center text-[10px] text-dim/70">
            There is no recovery — if you forget this password, saved passwords are lost.
          </p>
        )}
      </form>
    </div>
  )
}
