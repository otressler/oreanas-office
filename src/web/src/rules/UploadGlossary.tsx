// The admin page's "Regelglossar übernehmen" (knowledge/features/rules-glossary.md): uploads
// regelglossar.json from scripts/glossary-seed.mjs, which replaces the whole glossary. The texts
// are the Player's Handbook's and never enter the repository.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { GlossaryEntry } from '../api/types'
import { Button, ErrorAlert, Note, Panel } from '../components/ui'
import { de } from '../text/de'
import { glossaryKeys } from './glossary'

const t = de.rules.glossary.upload

export function UploadGlossary() {
  const queries = useQueryClient()
  const current = useQuery({
    queryKey: glossaryKeys.all,
    queryFn: () => unwrap(api.GET('/api/rules/glossary')),
    staleTime: Infinity,
  })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  const upload = async () => {
    if (!file) return
    setError(null)
    setResult(null)
    setBusy(true)
    try {
      const body = JSON.parse(await file.text()) as { entries: GlossaryEntry[] }
      const done = await unwrap(
        api.PUT('/api/admin/rules/glossary', { body: { entries: body.entries } }),
      )
      await queries.invalidateQueries({ queryKey: glossaryKeys.all })
      setResult(t.done(done.entries))
    } catch (err) {
      setError(err instanceof SyntaxError ? de.errors.glossaryInvalid : err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title={t.title}>
      <p className="text-sm text-dim">{t.intro}</p>
      {current.data && <p className="text-sm text-parchment">{t.current(current.data.length)}</p>}
      <label className="flex flex-col gap-1 text-sm text-dim">
        {t.pick}
        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <ErrorAlert error={error} />
      {result && <Note>{result}</Note>}
      <Button
        className="self-start"
        variant="primary"
        busy={busy}
        disabled={!file}
        onClick={() => void upload()}
      >
        {t.start}
      </Button>
    </Panel>
  )
}
