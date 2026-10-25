// The confirm step before an icon or portrait job (knowledge/decisions/image-budget.md:
// never automatically). Says what happens and what the month has used; with the budget used
// up or no image model on the server it only says so and offers no confirm.
import type { ImageBudget } from '../api/types'
import { Button } from '../components/ui'
import { budgetBlock, formatUsd } from '../editor/background/backgrounds'
import { Modal } from '../sync/Modal'
import { de } from '../text/de'

const t = de.tokenImages

/**
 * What is confirmed: a creature icon, a portrait, an upload painted in the token style, a
 * custom status's icon (stage 9), or a campaign's cover.
 */
export type TokenJob = 'icon' | 'portrait' | 'restyle' | 'statusIcon' | 'cover'

const titles: Record<TokenJob, string> = {
  icon: t.confirm.iconTitle,
  portrait: t.confirm.portraitTitle,
  restyle: t.confirm.restyleTitle,
  statusIcon: de.statuses.icon.confirmTitle,
  cover: t.confirm.coverTitle,
}

const sources: Record<TokenJob, string> = {
  icon: t.confirm.iconFrom,
  portrait: t.confirm.portraitFrom,
  restyle: t.confirm.restyleFrom,
  statusIcon: de.statuses.icon.confirmFrom,
  cover: t.confirm.coverFrom,
}

export function ConfirmDialog({
  job,
  budget,
  onConfirm,
  onClose,
}: {
  job: TokenJob
  budget: ImageBudget | undefined
  onConfirm: () => void
  onClose: () => void
}) {
  const block = budgetBlock(budget)
  return (
    <Modal title={titles[job]} onClose={onClose}>
      <div className="flex max-w-prose flex-col gap-2 text-sm">
        <p>{sources[job]}</p>
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
            {job === 'restyle' ? t.confirm.restyleOk : t.confirm.ok}
          </Button>
        )}
        <Button onClick={onClose}>{de.common.cancel}</Button>
      </div>
    </Modal>
  )
}
