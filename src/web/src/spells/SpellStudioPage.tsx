// /zauber/varianten/:variantId/studio — the spell-cards studio for one variant
// (knowledge/features/spell-cards.md, "Art studio"): the card and notes, the motifs A, B, …
// with their revisions, requests as tiles while they are open, every picture as a card front
// with ★, ✕ and "Als Kartenbild", and a lightbox. Only the author (and admins) change anything.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type {
  SpellArtEvent,
  SpellArtImage,
  SpellArtPrompt,
  SpellStudio,
  SpellVariant,
} from '../api/types'
import { BackLink } from '../components/sheet'
import { inputClass } from '../components/styles'
import { Button, ErrorAlert, LoadError, Loading, PageTitle } from '../components/ui'
import { Modal } from '../sync/Modal'
import { de } from '../text/de'
import { spellPaths } from './paths'
import { SpellCardView, type CardSpell } from './SpellCard'
import { spellKeys, uploadSpellArt } from './queries'
import { useSpellArtWatch } from './useSpellArtWatch'

const t = de.spells.studio
const OPEN = new Set(['queued', 'running'])
const HIDE_REJECTED_KEY = 'oreana.spellStudio.hideRejected'
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
const took = (from: string, to?: string | null) => {
  const s = Math.max(0, Math.round(((to ? Date.parse(to) : Date.now()) - Date.parse(from)) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function useStudio(variantId: string) {
  return useQuery({
    queryKey: spellKeys.studio(variantId),
    queryFn: () =>
      unwrap(
        api.GET('/api/spells/variants/{variantId}/studio', { params: { path: { variantId } } }),
      ),
  })
}

/** Derived per-picture state from the append-only events: the newest ★/✕ counts. */
function flags(events: SpellArtEvent[]) {
  const latest = new Map<string, string | null>()
  const dismissed = new Set<string>()
  for (const e of events) {
    if (!e.assetId) continue
    if (e.kind === 'dismiss') dismissed.add(e.assetId)
    if (e.kind === 'favorite' || e.kind === 'reject')
      latest.set(`${e.kind}:${e.assetId}`, e.value ?? null)
  }
  return {
    favorite: (id: string) => latest.get(`favorite:${id}`) === '1',
    rejected: (id: string) => latest.get(`reject:${id}`) === '1',
    dismissed: (id: string) => dismissed.has(id),
    comments: (id: string | null) =>
      events.filter((e) => e.kind === 'comment' && (e.assetId ?? null) === id),
  }
}

export function SpellStudioPage() {
  const { variantId = '' } = useParams()
  const studio = useStudio(variantId)
  const queries = useQueryClient()
  const refresh = () => void queries.invalidateQueries({ queryKey: spellKeys.studio(variantId) })
  const open = studio.data?.images.some((i) => OPEN.has(i.status)) ?? false
  useSpellArtWatch(variantId, open, refresh)

  if (studio.isPending) return <Loading />
  if (studio.isError)
    return <LoadError error={studio.error} onRetry={() => void studio.refetch()} />
  return <Studio key={variantId} studio={studio.data} refresh={refresh} />
}

function Studio({ studio, refresh }: { studio: SpellStudio; refresh: () => void }) {
  const queries = useQueryClient()
  const variant = studio.variant
  const can = studio.canEdit
  const [error, setError] = useState<unknown>(null)
  const [hideRejected, setHideRejected] = useState(
    () => localStorage.getItem(HIDE_REJECTED_KEY) === '1',
  )
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [newLetters, setNewLetters] = useState<string[]>([])
  const f = flags(studio.events)

  const byLetter = new Map<string, SpellArtPrompt[]>()
  for (const p of studio.prompts) byLetter.set(p.letter, [...(byLetter.get(p.letter) ?? []), p])
  const letters = [...new Set([...byLetter.keys(), ...newLetters])].sort()
  const revisionNumber = new Map<string, number>()
  for (const revs of byLetter.values()) revs.forEach((p, i) => revisionNumber.set(p.id, i + 1))

  const visible = (i: SpellArtImage) =>
    !hideRejected || !f.rejected(i.id) || i.id === variant.artAssetId
  const pictures = studio.images.filter((i) => i.status === 'done' && visible(i))
  const ordered = [
    ...letters.flatMap((l) => pictures.filter((i) => i.letter === l)),
    ...pictures.filter((i) => !i.letter || !letters.includes(i.letter)),
  ]

  const act = async (run: () => Promise<unknown>) => {
    setError(null)
    try {
      await run()
      refresh()
      // The picked art and "abgenommen" also show on the spell page and in the library.
      void queries.invalidateQueries({ queryKey: spellKeys.spell(variant.spellId) })
      void queries.invalidateQueries({ queryKey: spellKeys.library })
    } catch (err) {
      setError(err)
    }
  }
  const path = { params: { path: { variantId: variant.id } } }
  const actions = {
    event: (
      kind: 'comment' | 'favorite' | 'reject' | 'dismiss',
      assetId: string | null,
      value?: string,
    ) =>
      act(() =>
        unwrap(
          api.POST('/api/spells/variants/{variantId}/studio/events', {
            ...path,
            body: { kind, assetId, value: value ?? null },
          }),
        ),
      ),
    pick: (assetId: string) =>
      act(() =>
        unwrap(
          api.PUT('/api/spells/variants/{variantId}/studio/art', { ...path, body: { assetId } }),
        ),
      ),
    generate: (letter: string | null, promptId?: string) =>
      act(() =>
        unwrap(
          api.POST('/api/spells/variants/{variantId}/studio/generate', {
            ...path,
            body: { letter, promptId: promptId ?? null },
          }),
        ),
      ),
    save: (letter: string, subject: string, generate: boolean) =>
      act(() =>
        unwrap(
          api.POST('/api/spells/variants/{variantId}/studio/prompts', {
            ...path,
            body: { letter, subject, generate },
          }),
        ),
      ),
    // A motif from the text model for the editor; null after an error, which shows above.
    suggest: async () => {
      setError(null)
      try {
        const { subject } = await unwrap(
          api.POST('/api/spells/variants/{variantId}/studio/motif', path),
        )
        // It counts against the month's budget, shown under the title.
        refresh()
        return subject
      } catch (err) {
        setError(err)
        return null
      }
    },
    cancel: (assetId: string) =>
      act(() =>
        unwrap(
          api.DELETE('/api/spells/variants/{variantId}/studio/requests/{assetId}', {
            params: { path: { variantId: variant.id, assetId } },
          }),
        ),
      ),
    upload: (letter: string | null, files: FileList) =>
      act(async () => {
        for (const file of Array.from(files)) await uploadSpellArt(variant.id, file, letter)
      }),
    approve: () =>
      act(() =>
        unwrap(
          api.PUT('/api/spells/variants/{variantId}/studio/approved', {
            ...path,
            body: { approved: !variant.artApproved },
          }),
        ),
      ),
  }

  const art = studio.images.find((i) => i.id === variant.artAssetId)
  const running = studio.images.filter((i) => OPEN.has(i.status) && i.status === 'running').length
  const waiting = studio.images.filter((i) => i.status === 'queued').length
  const failed = studio.images.filter((i) => i.status === 'failed' && !f.dismissed(i.id)).length

  return (
    <div className="flex flex-col pb-8">
      <BackLink to={spellPaths.spell(variant.spellId)} label={variant.card.name} />
      <div className="flex flex-wrap items-end gap-3">
        <PageTitle>{t.title(variant.card.name)}</PageTitle>
        <span className="mb-3 text-sm text-dim">{t.queueSummary(running, waiting, failed)}</span>
        <label className="mb-2 ml-auto flex min-h-11 items-center gap-2 text-sm text-parchment">
          <input
            type="checkbox"
            className="size-5 accent-candle"
            checked={hideRejected}
            onChange={(event) => {
              setHideRejected(event.target.checked)
              localStorage.setItem(HIDE_REJECTED_KEY, event.target.checked ? '1' : '0')
            }}
          />
          {t.hideRejected}
        </label>
        {can && (
          <Button
            className="mb-2"
            variant={variant.artApproved ? 'primary' : 'secondary'}
            onClick={() => void actions.approve()}
          >
            {variant.artApproved ? t.approved : t.approve}
          </Button>
        )}
      </div>
      <p className="text-sm text-dim">
        {!studio.generator.available
          ? t.generatorOff
          : `${studio.generator.model} · ${studio.generator.quality} · ${studio.generator.width} × ${studio.generator.height}`}
        {' · '}
        {t.budget(`$${studio.budget.spentUsd.toFixed(2)}`, `$${studio.budget.limitUsd.toFixed(2)}`)}
      </p>
      {!can && <p className="mt-2 text-sm text-candle">{t.readOnly}</p>}
      <ErrorAlert error={error} />

      <div className="mt-6 grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => art && setLightbox(art.id)}
              aria-label={t.isArt}
              disabled={!art}
            >
              <SpellCardView zoom={1} spell={cardOf(variant, art?.url)} />
            </button>
            <SpellCardView zoom={1} side="back" spell={cardOf(variant, null)} />
          </div>
          <Comments
            title={t.notes}
            placeholder={t.notePlaceholder}
            list={f.comments(null)}
            canWrite={can}
            onAdd={(text) => actions.event('comment', null, text)}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {letters.map((letter) => (
            <Motif
              key={letter}
              letter={letter}
              revisions={byLetter.get(letter) ?? []}
              studio={studio}
              images={studio.images.filter(
                (i) => i.letter === letter && (i.status !== 'done' || visible(i)),
              )}
              flags={f}
              revisionNumber={revisionNumber}
              can={can}
              actions={actions}
              onOpen={setLightbox}
            />
          ))}
          {can && (
            <Button
              className="self-start"
              onClick={() => {
                const next = LETTERS.find((l) => !letters.includes(l))
                if (next) setNewLetters([...newLetters, next])
              }}
            >
              {t.newMotif}
            </Button>
          )}
          {(() => {
            const loose = studio.images.filter(
              (i) =>
                (!i.letter || !letters.includes(i.letter)) && (i.status !== 'done' || visible(i)),
            )
            return loose.length > 0 ? (
              <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel/60 p-4">
                <header>
                  <h2 className="font-display text-lg font-semibold text-parchment">{t.loose}</h2>
                  <p className="text-sm text-dim">{t.looseHint}</p>
                </header>
                <Gallery
                  images={loose}
                  studio={studio}
                  flags={f}
                  revisionNumber={revisionNumber}
                  can={can}
                  actions={actions}
                  onOpen={setLightbox}
                />
              </section>
            ) : null
          })()}
        </div>
      </div>

      {lightbox && (
        <Lightbox
          id={lightbox}
          ordered={ordered}
          studio={studio}
          flags={f}
          revisionNumber={revisionNumber}
          can={can}
          actions={actions}
          onStep={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}

const cardOf = (variant: SpellVariant, artUrl: string | null | undefined): CardSpell => ({
  nameEn: variant.nameEn,
  level: variant.level,
  school: variant.school,
  card: variant.card,
  artUrl,
})

type Flags = ReturnType<typeof flags>
type Actions = {
  event: (
    kind: 'comment' | 'favorite' | 'reject' | 'dismiss',
    assetId: string | null,
    value?: string,
  ) => Promise<void>
  pick: (assetId: string) => Promise<void>
  generate: (letter: string | null, promptId?: string) => Promise<void>
  save: (letter: string, subject: string, generate: boolean) => Promise<void>
  suggest: () => Promise<string | null>
  cancel: (assetId: string) => Promise<void>
  upload: (letter: string | null, files: FileList) => Promise<void>
  approve: () => Promise<void>
}

function Motif({
  letter,
  revisions,
  studio,
  images,
  flags: f,
  revisionNumber,
  can,
  actions,
  onOpen,
}: {
  letter: string
  revisions: SpellArtPrompt[]
  studio: SpellStudio
  images: SpellArtImage[]
  flags: Flags
  revisionNumber: Map<string, number>
  can: boolean
  actions: Actions
  onOpen: (id: string) => void
}) {
  const current = revisions.at(-1)
  const [draft, setDraft] = useState<string | null>(null)
  const [history, setHistory] = useState(false)
  const [busy, setBusy] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const upload = useRef<HTMLInputElement>(null)
  const text = draft ?? current?.subject ?? ''
  const dirty = draft != null && draft.trim() !== (current?.subject ?? '')

  const save = async (generate: boolean) => {
    if (!text.trim()) return
    setBusy(true)
    await actions.save(letter, text.trim(), generate)
    setDraft(null)
    setBusy(false)
  }

  const suggest = async () => {
    setSuggesting(true)
    const subject = await actions.suggest()
    if (subject) setDraft(subject)
    setSuggesting(false)
  }

  return (
    <section
      className={`flex flex-col gap-3 rounded-xl border bg-panel/60 p-4 ${dirty ? 'border-candle/60' : 'border-line'}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-semibold text-parchment">{t.motif(letter)}</h2>
        <span className="text-sm text-dim">
          {current ? `${t.revision(revisions.length)} · ${fmt(current.createdAt)}` : t.notSaved}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          {revisions.length > 1 && (
            <Button variant="quiet" aria-pressed={history} onClick={() => setHistory(!history)}>
              {t.history}
            </Button>
          )}
          {can && (
            <>
              <Button onClick={() => upload.current?.click()}>{t.upload}</Button>
              <input
                ref={upload}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(event) => {
                  if (event.target.files?.length) void actions.upload(letter, event.target.files)
                  event.target.value = ''
                }}
              />
              {current && (
                <Button
                  variant="primary"
                  disabled={!studio.generator.available}
                  onClick={() => void actions.generate(letter)}
                >
                  {t.generate}
                </Button>
              )}
            </>
          )}
        </span>
      </header>
      <textarea
        className={`${inputClass} field-sizing-content min-h-20 w-full resize-none font-mono text-sm`}
        aria-label={t.motif(letter)}
        placeholder={t.subjectPlaceholder}
        value={text}
        readOnly={!can}
        maxLength={1500}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            void save(false)
          }
        }}
      />
      {can && (
        <div className="flex flex-wrap items-center gap-2">
          <Button busy={busy} disabled={!dirty} onClick={() => void save(false)}>
            {t.save}
          </Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={!text.trim() || !studio.generator.available}
            onClick={() => void save(true)}
          >
            {t.saveGenerate}
          </Button>
          {studio.motifSuggestions && (
            <Button
              busy={suggesting}
              disabled={busy}
              title={t.suggestHint}
              onClick={() => void suggest()}
            >
              {t.suggest}
            </Button>
          )}
          {dirty && (
            <Button variant="quiet" onClick={() => setDraft(null)}>
              {t.discard}
            </Button>
          )}
          <span className="text-xs text-dim">{t.ctrlEnter}</span>
        </div>
      )}
      {history && (
        <ol className="flex flex-col gap-2 border-l border-line pl-3">
          {revisions
            .slice()
            .reverse()
            .map((p) => (
              <li key={p.id} className="flex flex-col gap-1">
                <span className="text-xs text-dim">
                  {t.revision(revisionNumber.get(p.id) ?? 0)} · {fmt(p.createdAt)} ·{' '}
                  {t.pictures(
                    studio.images.filter((i) => i.promptId === p.id && i.status === 'done').length,
                  )}
                </span>
                <p className="text-sm text-parchment">{p.subject}</p>
                {p === current ? (
                  <span className="text-xs text-candle">{t.current}</span>
                ) : (
                  can && (
                    <span className="flex gap-2">
                      <Button variant="quiet" onClick={() => setDraft(p.subject)}>
                        {t.restore}
                      </Button>
                      <Button variant="quiet" onClick={() => void actions.generate(null, p.id)}>
                        {t.generate}
                      </Button>
                    </span>
                  )
                )}
              </li>
            ))}
        </ol>
      )}
      <Gallery
        images={images}
        studio={studio}
        flags={f}
        revisionNumber={revisionNumber}
        can={can}
        actions={actions}
        onOpen={onOpen}
      />
    </section>
  )
}

function Gallery({
  images,
  studio,
  flags: f,
  revisionNumber,
  can,
  actions,
  onOpen,
}: {
  images: SpellArtImage[]
  studio: SpellStudio
  flags: Flags
  revisionNumber: Map<string, number>
  can: boolean
  actions: Actions
  onOpen: (id: string) => void
}) {
  const shown = images.filter((i) => i.status !== 'failed' || !f.dismissed(i.id))
  if (shown.length === 0) return <p className="text-sm text-dim">{t.noImages}</p>
  return (
    <ul className="flex flex-wrap gap-4">
      {shown.map((image) => (
        <li key={image.id}>
          {image.status === 'done' ? (
            <Thumb
              image={image}
              studio={studio}
              flags={f}
              revisionNumber={revisionNumber}
              can={can}
              actions={actions}
              onOpen={onOpen}
            />
          ) : (
            <RequestTile
              image={image}
              can={can}
              actions={actions}
              revision={image.promptId ? revisionNumber.get(image.promptId) : undefined}
            />
          )}
        </li>
      ))}
    </ul>
  )
}

/** Whether the picture's motif revision is still the current one of its letter. */
function stale(studio: SpellStudio, image: SpellArtImage) {
  if (!image.promptId || !image.letter) return false
  const current = studio.prompts.filter((p) => p.letter === image.letter).at(-1)
  return current?.id !== image.promptId
}

function Thumb({
  image,
  studio,
  flags: f,
  revisionNumber,
  can,
  actions,
  onOpen,
}: {
  image: SpellArtImage
  studio: SpellStudio
  flags: Flags
  revisionNumber: Map<string, number>
  can: boolean
  actions: Actions
  onOpen: (id: string) => void
}) {
  const fav = f.favorite(image.id)
  const rej = f.rejected(image.id)
  const art = studio.variant.artAssetId === image.id
  return (
    <figure className={`flex w-[9.6rem] flex-col gap-1 ${rej ? 'opacity-50' : ''}`}>
      <button
        type="button"
        onClick={() => onOpen(image.id)}
        className={`rounded-[1.1rem] ${art ? 'ring-2 ring-candle' : fav ? 'ring-2 ring-candle/50' : ''}`}
        aria-label={t.enlarge}
      >
        <SpellCardView zoom={0.55} spell={cardOf(studio.variant, image.url)} />
      </button>
      <figcaption className="flex flex-col gap-1">
        <span className="text-xs text-dim">
          {image.promptId && `${t.revision(revisionNumber.get(image.promptId) ?? 0)}`}
          {stale(studio, image) && <em title={t.staleHint}> {t.stale}</em>}
          {' · '}
          {t.origin[image.origin]}
          {image.startedAt && image.finishedAt && ` · ${took(image.startedAt, image.finishedAt)}`}
          {f.comments(image.id).length > 0 && ` · ✎${f.comments(image.id).length}`}
        </span>
        {can && (
          <span className="flex gap-1">
            <ToolButton
              on={fav}
              label={t.favorite}
              onClick={() => void actions.event('favorite', image.id, fav ? '0' : '1')}
            >
              ★
            </ToolButton>
            <ToolButton
              on={rej}
              label={t.reject}
              onClick={() => void actions.event('reject', image.id, rej ? '0' : '1')}
            >
              ✕
            </ToolButton>
            <ToolButton
              on={art}
              label={art ? t.isArt : t.useAsArt}
              onClick={() => !art && void actions.pick(image.id)}
              wide
            >
              {art ? t.isArt : t.useAsArt}
            </ToolButton>
          </span>
        )}
      </figcaption>
    </figure>
  )
}

function ToolButton({
  on,
  label,
  wide = false,
  onClick,
  children,
}: {
  on: boolean
  label: string
  wide?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`min-h-9 rounded border px-2 text-xs ${wide ? 'flex-1' : ''} ${on ? 'border-candle bg-candle/20 text-candle' : 'border-line text-dim hover:text-parchment'}`}
    >
      {children}
    </button>
  )
}

function RequestTile({
  image,
  can,
  actions,
  revision,
}: {
  image: SpellArtImage
  can: boolean
  actions: Actions
  revision?: number
}) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (image.status !== 'running') return
    const timer = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [image.status])
  return (
    <div
      role="status"
      className="flex h-[15.5rem] w-[9.6rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-panel p-3 text-center"
    >
      {image.status === 'queued' && (
        <>
          <span
            className="size-6 animate-pulse rounded-full border-2 border-dim"
            aria-hidden="true"
          />
          <b className="text-parchment">{t.queued}</b>
          {image.queuePosition != null && (
            <span className="text-xs text-dim">{t.queuePosition(image.queuePosition)}</span>
          )}
          {can && (
            <Button variant="quiet" onClick={() => void actions.cancel(image.id)}>
              {t.cancelRequest}
            </Button>
          )}
        </>
      )}
      {image.status === 'running' && (
        <>
          <span
            className="size-6 animate-spin rounded-full border-2 border-candle border-t-transparent"
            aria-hidden="true"
          />
          <b className="text-parchment">{t.running}</b>
          <span className="text-xs text-dim">
            {image.startedAt && took(image.startedAt)} · {t.runningHint}
          </span>
        </>
      )}
      {image.status === 'failed' && (
        <>
          <span className="text-2xl text-red-300" aria-hidden="true">
            ✗
          </span>
          <b className="text-parchment">{t.failed}</b>
          <span className="text-xs text-red-200">{t.failure[image.failure ?? 'error']}</span>
          {can && (
            <span className="flex gap-1">
              <Button
                variant="primary"
                onClick={() => void actions.generate(null, image.promptId ?? undefined)}
                disabled={!image.promptId}
              >
                {t.retry}
              </Button>
              <Button variant="quiet" onClick={() => void actions.event('dismiss', image.id)}>
                {t.dismiss}
              </Button>
            </span>
          )}
        </>
      )}
      {revision != null && <span className="text-xs text-dim">{t.revision(revision)}</span>}
    </div>
  )
}

function Comments({
  title,
  placeholder,
  list,
  canWrite,
  onAdd,
}: {
  title: string
  placeholder: string
  list: SpellArtEvent[]
  canWrite: boolean
  onAdd: (text: string) => Promise<void>
}) {
  const [text, setText] = useState('')
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-display text-sm font-semibold tracking-wider text-candle">{title}</h3>
      {list.map((c) => (
        <div key={c.id} className="rounded-lg border border-line p-2">
          <span className="text-xs text-dim">
            {c.userName} · {fmt(c.createdAt)}
          </span>
          <p className="text-sm whitespace-pre-wrap text-parchment">{c.value}</p>
        </div>
      ))}
      {canWrite && (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!text.trim()) return
            await onAdd(text.trim())
            setText('')
          }}
        >
          <textarea
            className={`${inputClass} field-sizing-content min-h-14 w-full resize-none text-sm`}
            aria-label={title}
            placeholder={placeholder}
            maxLength={1000}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <Button type="submit" className="self-start" disabled={!text.trim()}>
            {t.saveComment}
          </Button>
        </form>
      )}
    </section>
  )
}

function Lightbox({
  id,
  ordered,
  studio,
  flags: f,
  revisionNumber,
  can,
  actions,
  onStep,
  onClose,
}: {
  id: string
  ordered: SpellArtImage[]
  studio: SpellStudio
  flags: Flags
  revisionNumber: Map<string, number>
  can: boolean
  actions: Actions
  onStep: (id: string) => void
  onClose: () => void
}) {
  const image = studio.images.find((i) => i.id === id)
  const index = ordered.findIndex((i) => i.id === id)
  const step = (by: number) => {
    if (ordered.length === 0) return
    onStep(ordered[(index + by + ordered.length) % ordered.length].id)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).matches('textarea, input')) return
      if (event.key === 'ArrowLeft') step(-1)
      if (event.key === 'ArrowRight') step(1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })
  if (!image) return null
  const prompt = studio.prompts.find((p) => p.id === image.promptId)
  const fav = f.favorite(image.id)
  const rej = f.rejected(image.id)
  const art = studio.variant.artAssetId === image.id
  const d = t.details
  return (
    <Modal title={t.image(index + 1, ordered.length)} onClose={onClose} size="page">
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex flex-col items-center gap-3">
          {image.url && <img src={image.url} alt="" className="max-h-[75dvh] w-auto rounded-lg" />}
          <div className="flex gap-2">
            <Button onClick={() => step(-1)} aria-label={t.previous}>
              ←
            </Button>
            <Button onClick={() => step(1)} aria-label={t.next}>
              →
            </Button>
          </div>
        </div>
        <aside className="flex flex-col gap-4">
          <SpellCardView
            zoom={0.8}
            spell={cardOf(studio.variant, image.url)}
            className="self-center"
          />
          {can && (
            <div className="flex flex-wrap gap-2">
              <Button
                aria-pressed={fav}
                variant={fav ? 'primary' : 'secondary'}
                onClick={() => void actions.event('favorite', image.id, fav ? '0' : '1')}
              >
                ★ {t.favorite}
              </Button>
              <Button
                aria-pressed={rej}
                variant={rej ? 'primary' : 'secondary'}
                onClick={() => void actions.event('reject', image.id, rej ? '0' : '1')}
              >
                ✕
              </Button>
              <Button
                aria-pressed={art}
                variant={art ? 'primary' : 'secondary'}
                onClick={() => !art && void actions.pick(image.id)}
              >
                {art ? t.isArt : t.useAsArt}
              </Button>
            </div>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-dim">{d.motif}</dt>
            <dd className="text-parchment">
              {image.letter ? image.letter.toUpperCase() : '–'}
              {image.promptId && ` · ${t.revision(revisionNumber.get(image.promptId) ?? 0)}`}
            </dd>
            <dt className="text-dim">{d.source}</dt>
            <dd className="text-parchment">{t.origin[image.origin]}</dd>
            {image.model && (
              <>
                <dt className="text-dim">{d.model}</dt>
                <dd className="text-parchment">
                  {image.model} · {image.quality}
                </dd>
              </>
            )}
            <dt className="text-dim">{d.created}</dt>
            <dd className="text-parchment">{fmt(image.createdAt)}</dd>
            {image.startedAt && image.finishedAt && (
              <>
                <dt className="text-dim">{d.took}</dt>
                <dd className="text-parchment">{took(image.startedAt, image.finishedAt)}</dd>
              </>
            )}
          </dl>
          {prompt && <p className="text-sm text-parchment">{prompt.subject}</p>}
          {image.prompt && (
            <details>
              <summary className="cursor-pointer text-sm text-candle">{d.prompt}</summary>
              <pre className="mt-2 text-xs whitespace-pre-wrap text-dim">{image.prompt}</pre>
            </details>
          )}
          <Comments
            title={t.comments}
            placeholder={t.commentPlaceholder}
            list={f.comments(image.id)}
            canWrite={can}
            onAdd={(text) => actions.event('comment', image.id, text)}
          />
        </aside>
      </div>
    </Modal>
  )
}
