import { useEffect, useRef, useState } from 'react'
import type { BoardPerson, BoardToken, PresenceState } from '../api/types'
import { de } from '../text/de'
import { buildAvatars, type Avatar } from './presence'

const t = de.sharedTable

export interface PresenceRowProps {
  presence: PresenceState
  people: BoardPerson[]
  /** The fight's tokens, for the portraits and ring colours of the people's characters. */
  tokens: BoardToken[]
  /** Not used: PresentPerson.isSessionDm says who runs the session. Kept for callers of the stub. */
  sessionDmUserId?: string | null
}

/**
 * "Who is here": the row of round avatars along the top of the board
 * (knowledge/features/shared-table.md). Every board screen renders it: players, the DM,
 * the spectator screen and the shared screen. A greyed avatar has no device connected; a
 * tap shows the name and "verbunden" or "nicht verbunden", nothing else.
 */
export function PresenceRow({ presence, people, tokens }: PresenceRowProps) {
  const [open, setOpen] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const avatars = buildAvatars(presence, people, tokens)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (avatars.length === 0) return null
  const shown = avatars.find((avatar) => avatar.key === open)

  return (
    <div
      ref={root}
      role="group"
      aria-label={t.presence.label}
      className="relative flex shrink-0 flex-wrap items-center gap-1.5 px-2 py-1"
    >
      {avatars.map((avatar) => (
        <AvatarButton
          key={avatar.key}
          avatar={avatar}
          open={open === avatar.key}
          onToggle={() => setOpen((current) => (current === avatar.key ? null : avatar.key))}
        />
      ))}
      {shown && (
        <p
          role="status"
          className="absolute top-full left-2 z-30 rounded-lg border border-line bg-panel px-3 py-1.5 text-sm whitespace-nowrap text-parchment shadow-lg shadow-black/40"
        >
          <span className="font-semibold">{nameOf(shown)}</span>
          <span className="text-dim">
            {' · '}
            {shown.connected ? t.presence.connected : t.presence.notConnected}
          </span>
        </p>
      )}
    </div>
  )
}

function nameOf(avatar: Avatar): string {
  return avatar.kind === 'table' ? t.tableName : (avatar.name ?? t.presence.unknown)
}

function AvatarButton({
  avatar,
  open,
  onToggle,
}: {
  avatar: Avatar
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-label={t.presence.person(nameOf(avatar), avatar.connected)}
      aria-expanded={open}
      data-connected={avatar.connected}
      data-kind={avatar.kind}
      onClick={onToggle}
      style={{ borderColor: avatar.ring }}
      className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-panel text-sm font-semibold text-white ${
        avatar.connected ? '' : 'opacity-40 grayscale'
      }`}
    >
      {avatar.kind === 'table' ? (
        <TableIcon />
      ) : avatar.imageUrl ? (
        <img src={avatar.imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{avatar.initial}</span>
      )}
    </button>
  )
}

/** A round table seen from the side. */
function TableIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 text-parchment"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <ellipse cx="12" cy="9" rx="8" ry="3" />
      <path d="M12 12v8M8 20h8" />
    </svg>
  )
}
