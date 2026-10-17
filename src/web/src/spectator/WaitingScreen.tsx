// What the spectator screen shows without a fight (knowledge/features/spectator-view.md, "The
// screen"): "Noch nicht gestartet" for a planned session, the QR code and the characters while
// the session runs, "Sitzung beendet" afterwards. Large type: it is read from across a table.
import type { WatchedCharacter, WatchedSession } from '../api/types'
import { formatDate } from '../lib/dates'
import { de } from '../text/de'
import { QrCode } from './QrCode'

const t = de.spectator

function Frame({ session, children }: { session: WatchedSession; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto p-8 text-center">
      <div className="flex flex-col gap-1">
        <h1 className="text-4xl font-semibold text-parchment">{session.title}</h1>
        <p className="text-xl text-dim">{t.sessionDate(formatDate(session.date))}</p>
      </div>
      {children}
    </div>
  )
}

export function PlannedScreen({ session }: { session: WatchedSession }) {
  return (
    <Frame session={session}>
      <p className="text-3xl font-semibold text-candle">{t.notStarted}</p>
      <p className="max-w-xl text-xl text-dim">{t.notStartedHint}</p>
    </Frame>
  )
}

export function EndedScreen({ session }: { session: WatchedSession }) {
  return (
    <Frame session={session}>
      <p className="text-3xl font-semibold text-candle">{t.ended}</p>
      <p className="max-w-xl text-xl text-dim">{t.endedHint}</p>
    </Frame>
  )
}

/** The session runs and no fight does: the QR code to join (when the link is known) and the characters. */
export function WaitingScreen({ session, link }: { session: WatchedSession; link: string | null }) {
  return (
    <Frame session={session}>
      <p className="text-2xl font-semibold text-candle">{t.waiting}</p>
      <div className="flex flex-wrap items-center justify-center gap-10">
        {link && (
          <div className="flex flex-col items-center gap-3">
            <QrCode value={link} className="w-56 rounded-xl sm:w-64 lg:w-72" />
            <p className="max-w-64 text-lg text-dim">{t.scanToJoin}</p>
          </div>
        )}
        <section
          aria-labelledby="spectator-characters"
          className="flex flex-col items-center gap-3"
        >
          <h2 id="spectator-characters" className="text-xl font-semibold text-parchment">
            {t.characters}
          </h2>
          {session.characters.length === 0 ? (
            <p className="text-lg text-dim">{t.noCharacters}</p>
          ) : (
            <ul className="flex max-w-3xl flex-wrap justify-center gap-6">
              {session.characters.map((character) => (
                <li key={`${character.colorIndex}-${character.name}`}>
                  <Portrait character={character} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Frame>
  )
}

function Portrait({ character }: { character: WatchedCharacter }) {
  const ring = character.color ?? '#ffffff'
  return (
    <figure className="flex w-28 flex-col items-center gap-2">
      {character.imageUrl ? (
        <img
          src={character.imageUrl}
          alt={t.portrait(character.name)}
          className="size-24 rounded-full bg-panel object-cover"
          style={{ border: `4px solid ${ring}` }}
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-24 items-center justify-center rounded-full bg-panel text-4xl font-semibold text-parchment"
          style={{ border: `4px solid ${ring}` }}
        >
          {character.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <figcaption className="max-w-full truncate text-lg text-parchment">
        {character.name}
      </figcaption>
    </figure>
  )
}
