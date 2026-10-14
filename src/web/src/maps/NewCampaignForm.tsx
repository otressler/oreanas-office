import { useState, type FormEvent } from 'react'
import { createLocalCampaign } from '../campaigns/localCampaigns'
import { Button, ErrorAlert, Panel, TextField } from '../components/ui'
import { limits } from '../lib/limits'
import { useLocalUser } from '../offline/localUser'
import { de } from '../text/de'
import { keepStorage } from './storage'

const t = de.sync.localCampaign

/** A campaign made without the server; the next sync creates it there. */
export function NewCampaignForm() {
  const { db } = useLocalUser()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError(t.nameRequired)
      return
    }
    setError(null)
    setBusy(true)
    try {
      await createLocalCampaign(db, name)
      keepStorage()
      setName('')
    } catch {
      setError(de.maps.actionFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title={t.newTitle}>
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <TextField
          label={t.name}
          hint={t.hint}
          value={name}
          maxLength={limits.campaignName}
          autoComplete="off"
          required
          invalid={error === t.nameRequired}
          onChange={(event) => setName(event.target.value)}
        />
        <ErrorAlert error={error} />
        <Button type="submit" variant="primary" busy={busy} className="self-start">
          {t.create}
        </Button>
      </form>
    </Panel>
  )
}
