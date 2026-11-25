// Where a status's icon comes from (knowledge/features/statuses.md, "Icons"): its picture (a
// library status's static file or a custom status's picked version), else for a spell status
// its card icon, drawn in candle gold as a picture of its own so the board and the lists show it
// like any other icon. It's made in the app, so it works offline and costs nothing.
import type { StatusDefinition } from '../api/types'
import { CANDLE } from '../board/palette'
import { SPELL_ICONS } from '../spells/iconPaths'
import type { SpellIconName } from '../spells/model'

const drawn = new Map<string, string>()

/** A card icon as an SVG data URL, with a size so a canvas can draw it. */
export function spellIconUrl(name: string): string | null {
  if (!(name in SPELL_ICONS)) return null
  let url = drawn.get(name)
  if (!url) {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96" fill="none"` +
      ` stroke="${CANDLE}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"` +
      ` color="${CANDLE}">${SPELL_ICONS[name as SpellIconName]}</svg>`
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    drawn.set(name, url)
  }
  return url
}

/** The picture a status is drawn with, or null for its first letter. */
export function statusIconSrc(
  status: Pick<StatusDefinition, 'iconUrl'> & Partial<Pick<StatusDefinition, 'spellIcon'>>,
): string | null {
  if (status.iconUrl) return status.iconUrl
  return status.spellIcon ? spellIconUrl(status.spellIcon) : null
}
