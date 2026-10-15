// The map's background picture under the grid (knowledge/domain/battle-map.md, "Background
// image"). The picture lies at its frame: cell (x, y), relative to the map's top-left cell,
// with a size in cells; a map wider than 3:1 was padded, so the frame can start left of or
// above the map. Only the map's own area is shown. Until the picture has loaded, when it
// fails, or without one, the board keeps the plain rendering (the permanent fallback).
import { useEffect, useState } from 'react'
import type { BoardBackground } from '../api/types'
import { CELL } from './viewport'

/** A rectangle in world units (CELL per cell). */
export interface WorldRect {
  x: number
  y: number
  width: number
  height: number
}

/** Where the picture is drawn, in world units. */
export function pictureRect(
  frame: Pick<BoardBackground, 'x' | 'y' | 'width' | 'height'>,
): WorldRect {
  return {
    x: frame.x * CELL,
    y: frame.y * CELL,
    width: frame.width * CELL,
    height: frame.height * CELL,
  }
}

/** The map's own area, in world units: the picture is clipped to it. */
export function mapRect(width: number, height: number): WorldRect {
  return { x: 0, y: 0, width: width * CELL, height: height * CELL }
}

/** What the map layer draws, with or without a loaded picture. */
export interface MapLayers {
  picture: boolean
  /** Terrain, patterns, elevation, rims, entrances and feature shapes. */
  plain: boolean
  highlight: boolean
  grid: boolean
  /** Feature labels; the picture paints its features itself. */
  labels: boolean
}

export function mapLayers(pictureLoaded: boolean): MapLayers {
  return pictureLoaded
    ? { picture: true, plain: false, highlight: true, grid: true, labels: false }
    : { picture: false, plain: true, highlight: true, grid: true, labels: true }
}

/** Draws the picture at its frame, clipped to the map. `ctx` must be in world units. */
export function drawPicture(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  frame: Pick<BoardBackground, 'x' | 'y' | 'width' | 'height'>,
  width: number,
  height: number,
): void {
  const clip = mapRect(width, height)
  const at = pictureRect(frame)
  ctx.save()
  ctx.beginPath()
  ctx.rect(clip.x, clip.y, clip.width, clip.height)
  ctx.clip()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, at.x, at.y, at.width, at.height)
  ctx.restore()
}

// Images never change once made (knowledge/decisions/persistence.md), so a loaded one can
// be shown again at once, e.g. when the preview opens a second time.
const loaded = new Map<string, HTMLImageElement>()
const KEEP = 8

function remember(url: string, image: HTMLImageElement) {
  loaded.delete(url)
  loaded.set(url, image)
  while (loaded.size > KEEP) loaded.delete(loaded.keys().next().value!)
}

/** Forgets the loaded pictures (tests). */
export function forgetLoadedPictures(): void {
  loaded.clear()
}

/**
 * The picture at `url` once it has loaded; null while it loads, when it fails, and
 * without a url. One React render when it arrives; nothing per frame.
 */
export function useBackgroundImage(url: string | null | undefined): HTMLImageElement | null {
  const [state, setState] = useState<{ url: string; image: HTMLImageElement } | null>(null)
  useEffect(() => {
    if (!url || loaded.has(url)) return
    let current = true
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      remember(url, image)
      if (current) setState({ url, image })
    }
    image.onerror = () => {
      if (current) setState(null)
    }
    image.src = url
    return () => {
      current = false
      image.onload = null
      image.onerror = null
    }
  }, [url])
  if (!url) return null
  const cached = loaded.get(url)
  if (cached) return cached
  return state?.url === url ? state.image : null
}
