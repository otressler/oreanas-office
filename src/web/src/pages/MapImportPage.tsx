import { useState, type ChangeEvent, type DragEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiRequestError, errorMessage } from '../api/errors'
import type { ImportMapRequest } from '../api/types'
import { Button, PageTitle, Panel } from '../components/ui'
import { describeImportField } from '../encounters/fieldLabel'
import { useImportMap } from '../encounters/queries'
import { sampleMaps, type SampleMap } from '../samples'
import { de } from '../text/de'

const t = de.encounters.import

/** A file that isn't JSON, or isn't a map; found before asking the server. */
class FileError extends Error {}

/** Reads a dropped or picked file as an import request; the server checks the rest. */
async function readMapFile(file: File): Promise<ImportMapRequest> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new FileError(t.unreadable)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new FileError(t.notAMap)
  }
  return parsed as ImportMapRequest
}

/**
 * /kampagnen/:campaignId/karten/importieren — a `dm` member imports a map file or
 * picks a sample map (knowledge/domain/battle-map.md, "Import file"). The new
 * encounter is ready on the campaign page.
 */
export function MapImportPage() {
  const { campaignId = '' } = useParams()
  const navigate = useNavigate()
  const importMap = useImportMap(campaignId)
  // What is being imported, for the busy note; and a problem found before sending.
  const [pending, setPending] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const busy = pending !== null

  async function submit(name: string, load: () => Promise<ImportMapRequest>) {
    if (busy) return
    importMap.reset()
    setFileError(null)
    setPending(name)
    try {
      let file: ImportMapRequest
      try {
        file = await load()
      } catch (error) {
        setFileError(error instanceof FileError ? error.message : errorMessage(error))
        return
      }
      await importMap.mutateAsync(file)
      void navigate(`/kampagnen/${campaignId}`)
    } catch {
      // The server's answer is shown from importMap.error.
    } finally {
      setPending(null)
    }
  }

  function pickSample(sample: SampleMap) {
    void submit(sample.name, sample.load)
  }

  function pickFile(file: File | undefined) {
    if (file) void submit(file.name, () => readMapFile(file))
  }

  function onInput(event: ChangeEvent<HTMLInputElement>) {
    pickFile(event.target.files?.[0])
    // Picking the same file again after fixing it should import again.
    event.target.value = ''
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    pickFile(event.dataTransfer.files[0])
  }

  return (
    <div className="flex flex-col pb-8">
      <Link
        to={`/kampagnen/${campaignId}`}
        className="pt-4 text-sm text-candle underline-offset-4 hover:underline"
      >
        <span aria-hidden="true">← </span>
        {de.encounters.back}
      </Link>
      <PageTitle>{t.title}</PageTitle>

      {pending && (
        <p role="status" className="text-dim">
          {t.importing(pending)}
        </p>
      )}
      <ImportError error={fileError ?? importMap.error} />

      <Panel title={t.samplesTitle}>
        <p className="text-sm text-dim">{t.samplesBody}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {sampleMaps.map((sample) => (
            <li key={sample.id}>
              <Button
                className="w-full flex-col"
                disabled={busy}
                busy={pending === sample.name}
                onClick={() => pickSample(sample)}
              >
                <span className="font-semibold">{sample.name}</span>
                <span className="text-sm text-dim">
                  {t.sampleSize(sample.width, sample.height)}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={t.fileTitle}>
        <p className="text-sm text-dim">{t.fileBody}</p>
        <label
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center focus-within:border-candle ${
            dragging ? 'border-candle bg-candle/10' : 'border-line hover:border-candle'
          }`}
        >
          <span className="font-semibold text-parchment">{t.fileLabel}</span>
          <span className="text-sm text-dim">{t.fileDrop}</span>
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            disabled={busy}
            onChange={onInput}
          />
        </label>
      </Panel>
    </div>
  )
}

/** The German message, plus where in the file the server found the problem. */
function ImportError({ error }: { error: unknown }) {
  if (!error) return null
  const message = typeof error === 'string' ? error : errorMessage(error)
  const field = error instanceof ApiRequestError ? error.field : null
  return (
    <div
      role="alert"
      className="mt-2 flex flex-col gap-1 rounded-lg border border-red-400/50 bg-red-950/40 px-3 py-2 text-sm text-red-200"
    >
      <p>{message}</p>
      {field && <p>{t.where(describeImportField(field))}</p>}
    </div>
  )
}
