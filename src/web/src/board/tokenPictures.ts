// Token images on the board (knowledge/features/token-icons.md): each URL is loaded once
// into an HTMLImageElement and kept, since an asset never changes. A token shows its letter
// until its image has loaded, and for good when it fails. Components re-render once when an
// image they need arrives, which redraws the tokens; nothing happens per frame.
import { useEffect, useMemo, useState } from 'react'

interface Entry {
  image: HTMLImageElement
  loaded: boolean
  waiting: Set<() => void>
}

const entries = new Map<string, Entry>()
/** Loaded images kept; a fight has a few dozen different ones at most. */
const KEEP = 96

function evict() {
  if (entries.size <= KEEP) return
  for (const [url, entry] of entries) {
    if (entries.size <= KEEP) break
    if (entry.loaded) entries.delete(url)
  }
}

/**
 * Starts loading `url` unless it is loaded or on its way; `onSettled` runs when it loads or
 * fails. Returns the unsubscribe.
 */
function load(url: string, onSettled: () => void): () => void {
  const known = entries.get(url)
  if (known?.loaded) return () => {}
  if (known) {
    known.waiting.add(onSettled)
    return () => known.waiting.delete(onSettled)
  }
  const image = new Image()
  image.decoding = 'async'
  const entry: Entry = { image, loaded: false, waiting: new Set([onSettled]) }
  const settle = () => {
    const waiting = [...entry.waiting]
    entry.waiting.clear()
    for (const notify of waiting) notify()
  }
  image.onload = () => {
    entry.loaded = true
    evict()
    settle()
  }
  image.onerror = () => {
    // Forgotten, so a later board tries again; this one keeps the letter.
    if (entries.get(url) === entry) entries.delete(url)
    settle()
  }
  entries.set(url, entry)
  image.src = url
  return () => entry.waiting.delete(onSettled)
}

/** Forgets every image (tests). */
export function forgetTokenPictures(): void {
  entries.clear()
}

/** The loaded image of each URL, by URL; URLs still loading or failed are missing. */
export function useTokenPictures(
  urls: readonly (string | null | undefined)[],
): ReadonlyMap<string, HTMLImageElement> {
  const key = [...new Set(urls.filter((url): url is string => !!url))].sort().join('\n')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!key) return
    let live = true
    const bump = () => {
      if (live) setVersion((v) => v + 1)
    }
    const stops = key.split('\n').map((url) => load(url, bump))
    return () => {
      live = false
      for (const stop of stops) stop()
    }
  }, [key])
  return useMemo(() => {
    void version
    const loaded = new Map<string, HTMLImageElement>()
    if (!key) return loaded
    for (const url of key.split('\n')) {
      const entry = entries.get(url)
      if (entry?.loaded) loaded.set(url, entry.image)
    }
    return loaded
  }, [key, version])
}
