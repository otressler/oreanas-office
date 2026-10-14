// The confirm step before a background job (knowledge/decisions/image-budget.md: never
// automatically). Says what happens and what it costs; with the budget used up or no image
// model on the server it only says so and offers no confirm.
import type { ImageBudget } from '../../api/types'
import { Button } from '../../components/ui'
import { Modal } from '../../sync/Modal'
import { de } from '../../text/de'
import { budgetBlock, formatUsd } from './backgrounds'

const t = de.maps.background

export function ConfirmDialog({
  budget,
  onConfirm,
  onClose,
}: {
  /** Unknown for a map the server hasn't seen yet. */
  budget: ImageBudget | undefined
  onConfirm: () => void
  onClose: () => void
}) {
  const block = budgetBlock(budget)
  return (
    <Modal title={t.confirm.title} onClose={onClose}>
      <div className="flex max-w-prose flex-col gap-2 text-sm">
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
          <Button variant="primary" onClick={onConfirm}>
            {t.confirm.ok}
          </Button>
        )}
        <Button onClick={onClose}>{de.common.cancel}</Button>
      </div>
    </Modal>
  )
}
