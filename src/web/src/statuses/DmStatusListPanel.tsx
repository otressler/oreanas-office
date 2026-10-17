// "Meine Zustandsliste (Spielleitung)" on the campaign page (knowledge/features/statuses.md,
// "Status lists"): every `dm` member has their own, which the picker shows them first while
// they run the session. Folded until opened, so the page doesn't ask for it on every visit.
import { useId, useState } from 'react'
import { Button, Panel } from '../components/ui'
import { de } from '../text/de'
import { StatusListEditor } from './StatusListEditor'

const t = de.statuses.list

export function DmStatusListPanel({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <Panel
      title={t.dmTitle}
      action={
        <Button
          variant="secondary"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? t.hide : t.showDm}
        </Button>
      }
    >
      <p className="text-sm text-dim">{t.dmHelp}</p>
      {open && (
        <div id={id}>
          <StatusListEditor campaignId={campaignId} owner={{ kind: 'dm' }} />
        </div>
      )}
    </Panel>
  )
}
