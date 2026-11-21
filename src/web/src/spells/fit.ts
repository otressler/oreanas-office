// The spell-cards app's autofit (render.js), for one card: titles shrink to stay on one line
// (or two at a smaller size), the stats shrink to their width, and the back's text scale
// (--k) goes down from 1.15 until the frame holds everything. Returns whether the back
// still overflows. Layout is measured at print size: the card's transform doesn't count.

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
    if (el.scrollWidth <= el.clientWidth + 0.5 && el.scrollHeight <= el.clientHeight + 0.5)
      return true
  }
  return false
}

function fitTitle(el: HTMLElement, one: Shrink, two: Shrink) {
  el.style.whiteSpace = 'nowrap'
  if (shrink(el, one)) return
  el.style.whiteSpace = 'normal'
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

  let overflow = false
  all('.sc-back').forEach((card) => {
    const frame = card.querySelector<HTMLElement>('.sc-frame')
    if (!frame) return
    for (let k = 1.15; k >= 0.88; k -= 0.02) {
      card.style.setProperty('--k', k.toFixed(2))
      if (frame.scrollHeight <= frame.clientHeight + 0.5) break
    }
    if (frame.scrollHeight > frame.clientHeight + 0.5) overflow = true
  })
  return overflow
}
