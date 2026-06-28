import { useEffect, useRef, useState } from 'react'

interface Props {
  title: string
  message?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

export default function PasswordPrompt({ title, message, onSubmit, onCancel }: Props): JSX.Element {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={onCancel}
    >
      <form
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(value)
        }}
        className="w-[360px] max-w-[92vw] rounded-xl border border-border bg-bg-alt p-5 shadow-2xl"
      >
        <h2 className="mb-1 text-sm font-semibold text-content">{title}</h2>
        {message && <p className="mb-3 text-xs text-dim">{message}</p>}
        <input
          ref={ref}
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="••••••••"
          className="mb-4 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-content outline-none placeholder:text-dim/60 focus:border-accent"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-dim hover:text-content"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-[#11111b] disabled:opacity-40"
          >
            OK
          </button>
        </div>
      </form>
    </div>
  )
}
