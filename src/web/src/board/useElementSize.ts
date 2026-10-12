// The size of an element in CSS pixels, kept up to date through resizes and rotation.
import { useLayoutEffect, useState, type RefObject } from 'react'
import type { Size } from './viewport'

export function useElementSize(ref: RefObject<HTMLElement | null>): Size | null {
  const [size, setSize] = useState<Size | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const width = Math.round(element.clientWidth)
      const height = Math.round(element.clientHeight)
      setSize((current) =>
        current && current.width === width && current.height === height
          ? current
          : { width, height },
      )
    }
    measure()
    // Without ResizeObserver (old browsers, jsdom) window resizes still count.
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}
