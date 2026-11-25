// The explanation of a rules term (knowledge/features/rules-glossary.md): the glossary entry with
// its links to other entries ("Zurück" returns), as a sheet at the bottom on a phone and beside
// the term on a wider screen. One for the whole app, mounted with the glossary.
import { Fragment, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import type { GlossaryEntry } from '../api/types'
import { splitTerms } from '../spells/markupText'
import { de } from '../text/de'
import {
  findEntry,
  hoverLeave,
  hoverStay,
  useGlossaryData,
  useGlossaryHint,
  useLoadGlossary,
} from './glossary'

const t = de.rules.glossary

/** Loads the glossary and shows the explanation; inside the signed-in part of the app. */
export function GlossaryLayer() {
  useLoadGlossary()
  return <GlossaryHint />
}

function GlossaryHint() {
  const { trail, anchor, pinned, back, close, follow } = useGlossaryHint()
  const entry = trail.at(-1)
  const box = useRef<HTMLDivElement>(null)
  const wide = typeof window !== 'undefined' && !!window.matchMedia?.('(min-width: 640px)').matches

  // Escape closes the explanation only, not a dialog around the term; a tap elsewhere too.
  useEffect(() => {
    if (!entry) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      event.preventDefault()
      close()
      anchor?.focus()
    }
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (box.current?.contains(target) || target?.closest?.('.gl-term')) return
      close()
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer, true)
    }
  }, [entry, anchor, close])

  // A tap moves the focus into it, so a screen reader reads it; hovering leaves the focus.
  useEffect(() => {
    if (entry && pinned) box.current?.focus()
  }, [entry, pinned])

  if (!entry) return null
  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label={entry.name}
      tabIndex={-1}
      onMouseEnter={hoverStay}
      onMouseLeave={() => {
        if (!pinned) hoverLeave()
      }}
      style={wide ? placeBeside(anchor) : undefined}
      className={`fixed z-[1000] flex flex-col overflow-hidden border border-line bg-panel text-parchment shadow-2xl outline-none ${
        wide
          ? 'rounded-xl'
          : 'inset-x-0 bottom-0 max-h-[70dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]'
      }`}
    >
      <header className="flex items-start gap-2 border-b border-line px-4 py-3">
        {trail.length > 1 && (
          <button
            type="button"
            className="min-h-9 rounded px-1 text-sm text-candle hover:underline"
            onClick={back}
          >
            {t.back}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg leading-tight font-semibold">{entry.name}</h2>
          {entry.tag && <p className="text-xs tracking-wide text-dim">{entry.tag}</p>}
        </div>
        <button
          type="button"
          aria-label={t.close}
          className="flex size-9 items-center justify-center rounded text-dim hover:text-parchment"
          onClick={() => {
            close()
            anchor?.focus()
          }}
        >
          ✕
        </button>
      </header>
      <div className="overflow-y-auto overscroll-contain px-4 py-3">
        <GlossaryText entry={entry} onFollow={follow} />
      </div>
    </div>,
    document.body,
  )
}

/**
 * Beside the term on a wider screen: below it when there is room, else above, never off the
 * screen; opened from a link without a term on screen, in the middle near the top.
 */
function placeBeside(anchor: HTMLElement | null): CSSProperties {
  const width = Math.min(384, window.innerWidth - 16)
  if (!anchor) {
    return {
      left: (window.innerWidth - width) / 2,
      top: 80,
      width,
      maxHeight: window.innerHeight - 160,
    }
  }
  const rect = anchor.getBoundingClientRect()
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
  const below = window.innerHeight - rect.bottom
  return below > 280 || below > rect.top
    ? { left, top: rect.bottom + 6, width, maxHeight: Math.max(160, below - 16) }
    : { left, bottom: window.innerHeight - rect.top + 6, width, maxHeight: rect.top - 16 }
}

/**
 * An entry's text: paragraphs, bold, italic and lists through react-markdown, its tables by
 * hand (the glossary has a few), and its links to other entries as buttons.
 */
export function GlossaryText({
  entry,
  onFollow,
}: {
  entry: GlossaryEntry
  onFollow: (entry: GlossaryEntry) => void
}) {
  const byName = useGlossaryData((s) => s.byName)
  const link = (words: string, target?: string | null): ReactNode => {
    const found = findEntry(byName, words, target)
    return found && found.name !== entry.name ? (
      <button type="button" className="gl-term" onClick={() => onFollow(found)}>
        {words}
      </button>
    ) : (
      words
    )
  }
  return (
    <div className="gl-text flex flex-col gap-2 text-sm leading-relaxed">
      {chunks(entry.text).map((chunk, index) =>
        chunk.kind === 'table' ? (
          <Table key={index} rows={chunk.rows} cell={(text) => inline(text, link)} />
        ) : (
          <ReactMarkdown
            key={index}
            remarkPlugins={[remarkBreaks]}
            allowedElements={['p', 'strong', 'em', 'ul', 'ol', 'li', 'br', 'a']}
            unwrapDisallowed
            skipHtml
            components={{
              // "[[Begegnung]]" arrives as a link to "#glossar:Begegnung" (chunks()).
              a: ({ href, children }) => {
                const target = href?.startsWith('#glossar:')
                  ? decodeURIComponent(href.slice('#glossar:'.length))
                  : null
                return <>{target ? link(String(children), target) : children}</>
              },
            }}
          >
            {chunk.text}
          </ReactMarkdown>
        ),
      )}
    </div>
  )
}

type Chunk = { kind: 'markdown'; text: string } | { kind: 'table'; rows: string[][] }

/** Splits a text into Markdown and its tables; marks become links react-markdown keeps. */
function chunks(text: string): Chunk[] {
  const out: Chunk[] = []
  let lines: string[] = []
  let rows: string[][] = []
  const flush = () => {
    if (lines.length > 0) {
      out.push({
        kind: 'markdown',
        text: lines
          .join('\n')
          .replace(
            /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g,
            (_, words: string, target?: string) =>
              `[${words}](#glossar:${encodeURIComponent(target ?? words)})`,
          ),
      })
    }
    if (rows.length > 0) out.push({ kind: 'table', rows })
    lines = []
    rows = []
  }
  for (const line of text.split('\n')) {
    if (line.trim().startsWith('|')) {
      if (lines.length > 0) {
        const kept = rows
        rows = []
        flush()
        rows = kept
      }
      // The line under the header ("| --- |") only marks the header.
      if (!/^\s*\|[\s:|-]+\|\s*$/.test(line))
        rows.push(
          line
            .trim()
            .replace(/^\||\|$/g, '')
            .split('|')
            .map((cell) => cell.trim()),
        )
    } else {
      if (rows.length > 0) flush()
      lines.push(line)
    }
  }
  flush()
  return out
}

function Table({ rows, cell }: { rows: string[][]; cell: (text: string) => ReactNode }) {
  const [head, ...body] = rows
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr>
            {head.map((text, index) => (
              <th key={index} className="border-b border-line px-2 py-1 font-semibold">
                {cell(text)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, index) => (
            <tr key={index}>
              {row.map((text, i) => (
                <td key={i} className="border-b border-line/60 px-2 py-1 align-top">
                  {cell(text)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A table cell: plain text with its marks; "\*" and "\[" as the export escapes them. */
function inline(text: string, link: (words: string, target?: string | null) => ReactNode) {
  return splitTerms(text.replace(/\\([*[\]|])/g, '$1')).map((part, index) => (
    <Fragment key={index}>
      {part.kind === 'term' ? link(part.text, part.target) : part.text}
    </Fragment>
  ))
}
