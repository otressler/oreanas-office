// What a status is called and drawn with (knowledge/features/statuses.md). Library
// statuses take their German name from the app's text file by key; custom statuses bring
// their own. Shared by the board's badges and the token card.
import type { StatusDefinition } from '../api/types'
import { de } from '../text/de'

/** The status's German name. */
export function statusName(status: Pick<StatusDefinition, 'libraryKey' | 'name'>): string {
  return (status.libraryKey && de.statuses.library[status.libraryKey]) || status.name
}

/** The letter drawn on a badge when the status has no icon. */
export function statusLetter(status: Pick<StatusDefinition, 'libraryKey' | 'name'>): string {
  return statusName(status).trim().charAt(0).toUpperCase()
}
