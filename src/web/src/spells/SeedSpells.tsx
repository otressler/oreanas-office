// The admin page's "Zauberkarten übernehmen" (knowledge/features/spell-cards.md, "Seeding from
// spell-cards"): uploads spell-seed.json (from scripts/spell-seed.mjs), then each card's art
// from art/<key>.png. Running it twice skips spells seeded before and art they already have.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import { Button, ErrorAlert, Note, Panel } from '../components/ui'
import { de } from '../text/de'
import { spellKeys, uploadSpellArt } from './queries'

const t = de.spells.seed

export function SeedSpells() {
  const queries = useQueryClient()
  const [json, setJson] = useState<File | null>(null)
  const [art, setArt] = useState<File[]>([])
  const [progress, setProgress] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  const run = async () => {
    if (!json) return
    setError(null)
    setResult(null)
    try {
      const body = JSON.parse(await json.text()) as {
        spells: { key: string; artLetter?: string | null }[]
      }
      // The motif the studio's selected picture belongs to (scripts/spell-seed.mjs).
      const letters = new Map(body.spells.map((s) => [s.key, s.artLetter ?? null]))
      setProgress(t.running(0, body.spells.length))
      const seeded = await unwrap(api.POST('/api/admin/spells/seed', { body: body as never }))
      let uploaded = 0
      const pictures = art.filter(
        (file) => seeded.variants[file.name.replace(/\.(png|jpe?g|webp)$/i, '')],
      )
      for (const [index, file] of pictures.entries()) {
        const key = file.name.replace(/\.(png|jpe?g|webp)$/i, '')
        const variantId = seeded.variants[key]
        setProgress(t.running(index + 1, pictures.length))
        const variant = await unwrap(
          api.GET('/api/spells/variants/{variantId}', { params: { path: { variantId } } }),
        )
        if (variant.artAssetId) continue
        await uploadSpellArt(variantId, file, letters.get(key) ?? null)
        uploaded += 1
      }
      await queries.invalidateQueries({ queryKey: spellKeys.all })
      const rejected = Object.keys(seeded.rejected)
      setResult(
        [t.done(seeded.created, uploaded), rejected.length ? t.rejected(rejected.join(', ')) : '']
          .filter(Boolean)
          .join(' '),
      )
    } catch (err) {
      setError(err instanceof SyntaxError ? de.errors.spellInvalid : err)
    } finally {
      setProgress(null)
    }
  }

  return (
    <Panel title={t.title}>
      <p className="text-sm text-dim">{t.intro}</p>
      <label className="flex flex-col gap-1 text-sm text-dim">
        {t.pickJson}
        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => setJson(event.target.files?.[0] ?? null)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-dim">
        {t.pickArt}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={(event) => setArt(Array.from(event.target.files ?? []))}
        />
      </label>
      <ErrorAlert error={error} />
      {progress && (
        <p role="status" className="text-sm text-candle">
          {progress}
        </p>
      )}
      {result && <Note>{result}</Note>}
      <Button
        variant="primary"
        className="self-start"
        disabled={!json}
        busy={!!progress}
        onClick={() => void run()}
      >
        {t.start}
      </Button>
    </Panel>
  )
}
