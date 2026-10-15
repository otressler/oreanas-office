// The name and size of a new or copied map (map list and "Kampf hinzufügen").
import { MIN_MAP_SIZE } from '../editor/model'
import { limits } from '../lib/limits'
import { de } from '../text/de'

/** A whole number of cells within the limits, or null. */
export function parseSize(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  const n = Number(value)
  return n >= MIN_MAP_SIZE && n <= limits.mapSize ? n : null
}

/** "<Name> (Kopie)", shortened so it stays within the name limit. */
export function copyName(name: string): string {
  const full = de.maps.copyName(name)
  if (full.length <= limits.mapName) return full
  const room = limits.mapName - (full.length - name.length)
  return de.maps.copyName(name.slice(0, room).trimEnd())
}
