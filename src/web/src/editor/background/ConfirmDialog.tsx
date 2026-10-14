// The confirm step before a background job (knowledge/decisions/image-budget.md: never
// automatically). Says what happens and what it costs; with the budget used up or no image
// model on the server it only says so and offers no confirm.
//
// With `refining` it confirms a refinement: the DM writes what should change first.
import { useId, useState } from 'react'
import type { ImageBudget } from '../../api/types'
import { Button } from '../../components/ui'
import { inputClass } from '../../components/styles'
import { limits } from '../../lib/limits'
import { Modal } from '../../sync/Modal'
import { de } from '../../text/de'
import { budgetBlock, formatUsd } from './backgrounds'

const t = de.maps.background

/** Shows how many characters are left once the instruction gets close to its limit. */
const LEFT_FROM = 50

export function ConfirmDialog({
  budget,
  refining = false,
  onConfirm,
  onClose,
}: {
  /** Unknown for a map the server hasn't seen yet. */
  budget: ImageBudget | undefined
  /** Confirms a refinement: asks what should change, and passes it to `onConfirm`. */
  refining?: boolean
  onConfirm: (instruction: string) => void
  onClose: () => void
}) {
  const block = budgetBlock(budget)
  const id = useId()
  const [instruction, setInstruction] = useState('')
  const left = limits.refineInstruction - instruction.length
  const ready = !refining || instruction.trim().length > 0
  return (
    <Modal title={refining ? t.refine.title : t.confirm.title} onClose={onClose}>
      {refining && (
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className="text-sm font-semibold">
            {t.refine.instruction}
          </label>
          <textarea
            id={id}
            className={`${inputClass} resize-y`}
            rows={3}
            value={instruction}
            maxLength={limits.refineInstruction}
            placeholder={t.refine.placeholder}
            onChange={(event) => setInstruction(event.target.value)}
          />
          {left <= LEFT_FROM && <p className="text-xs text-dim">{t.refine.left(left)}</p>}
          <p className="max-w-prose text-sm text-dim">{t.refine.layoutHint}</p>
        </div>
      )}
      <div className="flex max-w-prose flex-col gap-2 text-sm">
        {refining && <p>{t.refine.result}</p>}
        <p>{t.confirm.sync}</p>
        <p>{t.confirm.quality}</p>
        <p>{t.confirm.cost}</p>
        {budget && (
          <p className="font-semibold tabular-nums">
            {t.spent(formatUsd(budget.spentUsd), formatUsd(budget.limitUsd))}
          </p>
        )}
        {block && (
          <p role="alert" className="text-red-300">
            {block === 'exhausted' ? t.budgetExhausted : t.unavailable}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {!block && (
          <Button variant="primary" disabled={!ready} onClick={() => onConfirm(instruction.trim())}>
            {refining ? t.refine.ok : t.confirm.ok}
          </Button>
        )}
        <Button onClick={onClose}>{de.common.cancel}</Button>
      </div>
    </Modal>
  )
}
