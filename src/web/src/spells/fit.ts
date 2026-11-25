// The spell-cards app's autofit (render.js), for one card: titles shrink to stay on one line
// (or two at a smaller size), the stats shrink to their width, and the back's text scale
// (--k) goes down from 1.15 until the body holds everything, but not below MIN_K: a back
// whose text still doesn't fit scrolls below its head and stats instead (.sc-scrolls,
// knowledge/features/spell-cards.md, "The card"). Layout is measured at print size: the
// card's transform doesn't count.

/** The smallest text scale of the back; below it the text would be hard to read on a phone. */
export const MIN_K = 1

interface Shrink {
  max: number
  min: number
  step?: number
  /** Lines the text may take; 0 checks only the width. */
  lines?: number
}

function shrink(el: HTMLElement, { max, min, step = 0.25, lines = 1 }: Shrink): boolean {
  const style = getComputedStyle(el)
  const ratio = parseFloat(style.lineHeight) / parseFloat(style.fontSize) || 1.1
  for (let pt = max; pt >= min; pt -= step) {
    el.style.fontSize = `${pt}pt`
    if (lines) el.style.maxHeight = `${lines * ratio * pt + 0.5}pt`
    // A quarter line of slack in height: a glyph from a fallback font (the soft hyphen of a
    // break point) sticks out of its line a little, but never as far as one more line.
    const slack = Math.max(0.5, 0.25 * pt * (96 / 72))
    if (el.scrollWidth <= el.clientWidth + 0.5 && el.scrollHeight <= el.clientHeight + slack)
      return true
  }
  return false
}

/**
 * One line if it fits; else two lines broken only between words or at the name's break point
 * ("Sonnen|explosion", a soft hyphen), so a word too wide keeps the title shrinking instead of
 * being cut anywhere ("SONNENEXP / LOSION"). Only a word too long even then gets the browser's
 * German hyphenation, and as the very last resort a break anywhere.
 */
function fitTitle(el: HTMLElement, one: Shrink, two: Shrink) {
  el.style.whiteSpace = 'nowrap'
  el.style.overflowWrap = 'normal'
  el.style.hyphens = 'manual'
  if (shrink(el, one)) return
  el.style.whiteSpace = 'normal'
  if (shrink(el, { ...two, lines: 2 })) return
  el.style.hyphens = 'auto'
  if (shrink(el, { ...two, lines: 2 })) return
  el.style.overflowWrap = 'anywhere'
  shrink(el, { ...two, lines: 2 })
}

export function fitCard(root: HTMLElement): boolean {
  // Nothing to measure without layout (tests, a hidden dialog).
  if (!root.offsetWidth) return false
  const all = (selector: string) => root.querySelectorAll<HTMLElement>(selector)
  all('[data-fit="h1"]').forEach((el) => fitTitle(el, { max: 17, min: 12 }, { max: 13.5, min: 9 }))
  all('[data-fit="h2"]').forEach((el) => fitTitle(el, { max: 12, min: 9 }, { max: 9.5, min: 7 }))
  all('[data-fit="en"], [data-fit="sub"]').forEach((el) =>
    shrink(el, { max: 7, min: 6, step: 0.2 }),
  )
  all('[data-fit="bar"]').forEach((el) => shrink(el, { max: 7, min: 6.4, step: 0.2, lines: 0 }))
  all('[data-fit="val"]').forEach((el) => shrink(el, { max: 8, min: 6.4, step: 0.2 }))

  let scrolls = false
  all('.sc-back').forEach((card) => {
    const frame = card.querySelector<HTMLElement>('.sc-frame')
    const body = card.querySelector<HTMLElement>('.sc-body')
    if (!frame || !body) return
    frame.classList.remove('sc-scrolls')
    const fits = () => body.scrollHeight <= body.clientHeight + 0.5
    for (let k = 1.15; k >= MIN_K - 0.001; k -= 0.02) {
      card.style.setProperty('--k', k.toFixed(2))
      if (fits()) break
    }
    if (fits()) {
      body.scrollTop = 0
    } else {
      card.style.setProperty('--k', MIN_K.toFixed(2))
      frame.classList.add('sc-scrolls')
      scrolls = true
    }
    updateScroll(body)
  })
  return scrolls
}

/**
 * Shows where a scrolling back is: the gold rail's thumb, the soft edge at the top once it has
 * moved, and the fade and arrow at the bottom until its end. Called after fitting and on scroll.
 */
export function updateScroll(body: HTMLElement) {
  const frame = body.parentElement
  if (!frame) return
  const height = body.clientHeight
  const max = body.scrollHeight - height
  frame.classList.toggle('sc-moved', body.scrollTop > 1)
  frame.classList.toggle('sc-at-end', body.scrollTop >= max - 1)
  const rail = frame.querySelector<HTMLElement>('.sc-rail')
  const thumb = rail?.firstElementChild as HTMLElement | null
  if (!rail || !thumb || max <= 0) return
  const inset = 4
  const length = height - 2 * inset
  const size = Math.max(0.12, height / body.scrollHeight) * length
  rail.style.top = `${body.offsetTop + inset}px`
  rail.style.height = `${length}px`
  thumb.style.height = `${size}px`
  thumb.style.top = `${(body.scrollTop / max) * (length - size)}px`
}
