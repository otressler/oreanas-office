import { useEffect, type ReactNode } from 'react'
import { Outlet } from 'react-router'
import { de } from '../text/de'
import { startServerGate, useServerStatus } from './serverStatus'

/** Route element: the child routes need the server (everything but the offline map pages). */
export function ServerGateOutlet() {
  return (
    <ServerGate>
      <Outlet />
    </ServerGate>
  )
}

/** Renders its children once the server is awake; until then a waking or offline screen. */
export function ServerGate({ children }: { children: ReactNode }) {
  const status = useServerStatus((s) => s.status)

  useEffect(() => {
    startServerGate()
  }, [])

  switch (status) {
    case 'ready':
      return children
    case 'checking':
      // Usually a few hundred milliseconds; staying blank avoids a flash.
      return null
    case 'offline':
      return (
        <GateMessage
          title={de.serverGate.offlineTitle}
          body={de.serverGate.offlineBody}
          testId="offline-screen"
        />
      )
    case 'error':
      return (
        <GateMessage
          title={de.serverGate.errorTitle}
          body={de.serverGate.errorBody}
          testId="error-screen"
          action={{ label: de.serverGate.retry, onClick: () => window.location.reload() }}
        />
      )
    case 'waking':
      return (
        <GateMessage
          title={de.serverGate.wakingTitle}
          body={de.serverGate.wakingBody}
          testId="waking-screen"
          busy
        />
      )
  }
}

function GateMessage({
  title,
  body,
  testId,
  busy = false,
  action,
}: {
  title: string
  body: string
  testId: string
  busy?: boolean
  action?: { label: string; onClick: () => void }
}) {
  return (
    <section
      role="status"
      aria-live="polite"
      aria-busy={busy}
      data-testid={testId}
      className="mx-auto flex max-w-md flex-col items-center gap-4 px-2 py-16 text-center"
    >
      <span
        aria-hidden="true"
        className={
          busy
            ? 'size-3 rounded-full bg-candle shadow-[0_0_18px_4px] shadow-candle/50 motion-safe:animate-pulse'
            : 'size-3 rounded-full border-2 border-dim'
        }
      />
      <h1 className="text-2xl font-semibold text-parchment">{title}</h1>
      <p className="text-base text-dim">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-md border border-candle px-4 py-2 text-candle hover:bg-candle/10"
        >
          {action.label}
        </button>
      )}
    </section>
  )
}
