import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { Session } from '../types'

interface Props {
  session: Session
  active: boolean
}

export default function TerminalView({ session, active }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const termRef = useRef<Terminal | null>(null)

  // Create the terminal + pty once per session.
  useEffect(() => {
    const term = new Terminal({
      fontFamily: 'Menlo, "SF Mono", monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc'
      }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current!)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    const { cols, rows } = term
    window.api.pty.create(session.id, session.profile, cols, rows)

    const offData = window.api.pty.onData(session.id, (data) => term.write(data))
    const offExit = window.api.pty.onExit(session.id, (code) => {
      term.write(`\r\n\x1b[90m[session closed — exit code ${code}]\x1b[0m\r\n`)
    })

    const dataDisp = term.onData((data) => window.api.pty.write(session.id, data))
    const resizeDisp = term.onResize(({ cols, rows }) =>
      window.api.pty.resize(session.id, cols, rows)
    )

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* element not visible */
      }
    })
    ro.observe(hostRef.current!)

    return () => {
      ro.disconnect()
      offData()
      offExit()
      dataDisp.dispose()
      resizeDisp.dispose()
      window.api.pty.kill(session.id)
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  // Refit + focus whenever this tab becomes active.
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => {
      try {
        fitRef.current?.fit()
        termRef.current?.focus()
      } catch {
        /* not visible yet */
      }
    }, 0)
    return () => clearTimeout(t)
  }, [active])

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 p-1.5"
      style={{ display: active ? 'block' : 'none' }}
    />
  )
}
