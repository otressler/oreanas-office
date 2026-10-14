// The status bar's count of layout problems ("Keine Probleme", "3 Probleme"). A click
// opens the list above it; picking a problem selects its item and closes the list.
import { useMemo } from 'react'
import { Popover } from '../../components/Popover'
import { de } from '../../text/de'
import { useEditor } from '../store'
import { checkLayout } from '../validation'
import { ChecksPanel } from './panels'

const t = de.editorFeatures.checks

export function ChecksStatus() {
  const doc = useEditor((s) => s.doc)
  const count = useMemo(() => checkLayout(doc).length, [doc])
  return (
    <Popover
      title={t.title}
      side="above"
      trigger={
        <>
          {count > 0 && <span aria-hidden="true">⚠ </span>}
          <span>{count === 0 ? t.none : t.count(count)}</span>
        </>
      }
      triggerClassName={`min-h-7 rounded px-2 text-xs whitespace-nowrap ${
        count === 0
          ? 'text-dim hover:text-parchment'
          : 'font-semibold text-red-300 hover:text-red-200'
      }`}
    >
      {(close) => <ChecksPanel onSelect={close} />}
    </Popover>
  )
}
