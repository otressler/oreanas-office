import { useSyncExternalStore } from 'react'

/** The map editor needs a laptop-sized screen (knowledge/features/dm-map-editor.md). */
export const WIDE_SCREEN_QUERY = '(min-width: 1024px)'

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(WIDE_SCREEN_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function wide(): boolean {
  // Tests (jsdom) have no matchMedia; they count as wide.
  return typeof window.matchMedia !== 'function' || window.matchMedia(WIDE_SCREEN_QUERY).matches
}

/** True on screens at least 1024 px wide; follows resizes and rotations. */
export function useWideScreen(): boolean {
  return useSyncExternalStore(subscribe, wide)
}
