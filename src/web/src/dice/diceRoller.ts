// <dice-roller>: the dice tray (knowledge/features/dice-tray.md). A custom element with
// its own shadow DOM, so its tumbling dice, sparks and glows animate without React
// re-rendering anything. It rolls on this device with the browser's secure random source;
// nothing leaves the device. DiceButton.tsx opens it in a dialog.
//
// Methods      add(sides, count = 1)   removeOne(sides)   clear()
//              setNotation("2W6+3")    roll() → Promise<DiceRollResult | null>
// Properties   modifier, mode, notation (read-only), lastResult (read-only), history
// Attributes   max-dice (default 24), history-size (default 8), bare (no panel of its own)
// Events       "dice-roll" (detail: DiceRollResult) and "dice-change"; both bubble.
import { canVibrate, vibrationEnabled } from '../table/haptics'
import { de } from '../text/de'
import { DICE_ROLLER_CSS } from './diceRollerStyles'
import {
  clampModifier,
  dieName,
  displayNotation,
  formatNotation,
  groupRolls,
  isSides,
  parseNotation,
  rollD20,
  rollDie,
  SIDES,
  type RollGroup,
  type RollMode,
  type Sides,
} from './notation'

const t = de.dice

export interface DiceRollResult {
  notation: string
  mode: RollMode
  modifier: number
  total: number
  groups: RollGroup[]
  dice: { sides: Sides; value: number; dropped: number | null }[]
  natural20: boolean
  natural1: boolean
  rolledAt: string
}

/** One line of "Letzte Würfe". */
export interface DiceHistoryEntry {
  notation: string
  mode: RollMode
  modifier: number
  total: number
  groups: RollGroup[]
}

interface Gem {
  fill: string
  rim: string
  num: string
  halo: string
}

// Each die type is its own resin "gem": body, rim, numeral colour, numeral halo. Deep,
// slightly dusty hues on the dark table; parchment numerals; the d20 wears the candle gold.
const GEMS: Record<Sides, Gem> = {
  4: { fill: '#6A4E9E', rim: '#3E2C63', num: '#ECE6D8', halo: 'rgba(16,8,36,.45)' },
  6: { fill: '#3A62A0', rim: '#223C67', num: '#ECE6D8', halo: 'rgba(6,16,40,.45)' },
  8: { fill: '#2F7A5A', rim: '#1A4A36', num: '#ECE6D8', halo: 'rgba(0,28,18,.45)' },
  10: { fill: '#B4683A', rim: '#6E3B1C', num: '#ECE6D8', halo: 'rgba(40,14,0,.45)' },
  12: { fill: '#A63A47', rim: '#65202A', num: '#ECE6D8', halo: 'rgba(40,4,10,.45)' },
  20: { fill: '#262A33', rim: '#E0AD4F', num: '#F0C46E', halo: 'rgba(0,0,0,.5)' },
  100: { fill: '#5E626D', rim: '#383B43', num: '#ECE6D8', halo: 'rgba(10,12,16,.45)' },
}

type Point = [number, number]

function regular(n: number, r: number, cx: number, cy: number, rot = -90): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = ((rot + (360 / n) * i) * Math.PI) / 180
    return [+(cx + r * Math.cos(a)).toFixed(2), +(cy + r * Math.sin(a)).toFixed(2)]
  })
}

interface Shape {
  pts: Point[]
  /** Face centre. */
  c: Point
  /** Face scale. */
  k: number
  /** Numeral size. */
  fs: number
}

// Flat silhouettes in a 100×100 box
const SHAPES: Record<Sides, Shape> = {
  4: {
    pts: [
      [50, 5],
      [96, 87],
      [4, 87],
    ],
    c: [50, 60],
    k: 0.5,
    fs: 30,
  },
  6: {
    pts: [
      [9, 9],
      [91, 9],
      [91, 91],
      [9, 91],
    ],
    c: [50, 50],
    k: 0.68,
    fs: 44,
  },
  8: {
    pts: [
      [50, 3],
      [97, 50],
      [50, 97],
      [3, 50],
    ],
    c: [50, 50],
    k: 0.56,
    fs: 38,
  },
  10: {
    pts: [
      [50, 2],
      [89, 40],
      [50, 98],
      [11, 40],
    ],
    c: [50, 45],
    k: 0.55,
    fs: 34,
  },
  12: { pts: regular(5, 49, 50, 54), c: [50, 54], k: 0.6, fs: 38 },
  20: { pts: regular(6, 49, 50, 50), c: [50, 50], k: 0.62, fs: 40 },
  100: { pts: regular(10, 48, 50, 50), c: [50, 50], k: 0.66, fs: 36 },
}

const LIGHT: Point = [-0.45, -0.89] // light falls from the top left

function dieSvg(sides: Sides): string {
  const s = SHAPES[sides]
  const g = GEMS[sides]
  const [cx, cy] = s.c
  const P = (a: Point[]) => a.map((p) => p.join(',')).join(' ')
  const inner = s.pts.map(([x, y]): Point => [
    +(cx + (x - cx) * s.k).toFixed(2),
    +(cy + (y - cy) * s.k).toFixed(2),
  ])
  let facets = ''
  for (let i = 0; i < s.pts.length; i++) {
    const j = (i + 1) % s.pts.length
    const a = s.pts[i]!
    const b = s.pts[j]!
    const mx = (a[0] + b[0]) / 2 - cx
    const my = (a[1] + b[1]) / 2 - cy
    const len = Math.hypot(mx, my) || 1
    const d = (mx / len) * LIGHT[0] + (my / len) * LIGHT[1]
    facets += `<polygon points="${P([a, b, inner[j]!, inner[i]!])}" fill="${d > 0 ? '#ECE6D8' : '#000'}" fill-opacity="${(Math.abs(d) * 0.3).toFixed(3)}"/>`
  }
  return (
    `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">` +
    `<polygon points="${P(s.pts)}" fill="${g.fill}"/>${facets}` +
    `<polygon points="${P(inner)}" fill="#ECE6D8" fill-opacity=".05" stroke="#ECE6D8" stroke-opacity=".16" stroke-width="1"/>` +
    `<polygon points="${P(s.pts)}" fill="none" stroke="${g.rim}" stroke-width="3" stroke-linejoin="round"/>` +
    `<text class="num" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="${g.num}" stroke="${g.halo}"></text>` +
    `<rect class="ul" x="${cx - 7}" y="0" width="14" height="3" rx="1.5" fill="${g.num}" visibility="hidden"/>` +
    `</svg>`
  )
}

/** A face shown while the die tumbles; it doesn't count, so Math.random will do. */
const flicker = (n: number) => 1 + Math.floor(Math.random() * n)

const canAnimate = () => typeof Element.prototype.animate === 'function'

/** Reduced motion, or a browser (or test DOM) without the Web Animations API. */
function reducedMotion(): boolean {
  return (
    !canAnimate() ||
    (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  )
}

/** Plays an animation if the browser can, and resolves when it ends either way. */
function play(
  el: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
): Promise<void> {
  if (!canAnimate()) return Promise.resolve()
  return el.animate(keyframes, options).finished.then(
    () => undefined,
    () => undefined,
  )
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** "2W6 (3, 5) + W20 (17 <s>4</s>) + 3"; only numbers go into the markup. */
function breakdownHtml(groups: readonly RollGroup[], modifier: number): string {
  let h = groups
    .map((g) => {
      const vals = g.rolls
        .map((r) => `${Number(r.value)}${r.dropped != null ? ` <s>${Number(r.dropped)}</s>` : ''}`)
        .join(', ')
      return `${dieName(g.sides, g.rolls.length)} <span class="vals">(${vals})</span>`
    })
    .join(' + ')
  if (modifier) h += ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}`
  return h
}

const POP: Keyframe[] = [
  { transform: 'scale(.2) rotate(-45deg)', opacity: 0 },
  { transform: 'scale(1.1) rotate(6deg)', opacity: 1, offset: 0.7 },
  { transform: 'none', opacity: 1 },
]

interface PoolDie {
  id: number
  sides: Sides
  value: number | null
  dropped: number | null
  el: HTMLButtonElement
}

interface Elements {
  tray: HTMLElement
  dice: HTMLElement
  empty: HTMLElement
  msg: HTMLElement
  expr: HTMLElement
  total: HTMLElement
  picks: HTMLButtonElement[]
  mod: HTMLOutputElement
  seg: HTMLElement
  thumb: HTMLElement
  modes: HTMLButtonElement[]
  clear: HTMLButtonElement
  roll: HTMLButtonElement
  hist: HTMLOListElement
  hcount: HTMLElement
  sr: HTMLElement
}

const MODES: readonly RollMode[] = ['normal', 'advantage', 'disadvantage']

export class DiceRoller extends HTMLElement {
  static get observedAttributes() {
    return ['max-dice', 'history-size']
  }

  private pool: PoolDie[] = []
  private mod = 0
  private rollMode: RollMode = 'normal'
  private entries: DiceHistoryEntry[] = []
  private rolling = false
  private rolled = false
  private uid = 0
  private max = 24
  private historyMax = 8
  private last: DiceRollResult | null = null
  private trayFx: 'glory' | 'doom' | null = null
  private resize: ResizeObserver | null = null
  private els!: Elements

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.build()
    this.readAttributes()
    this.sync()
    this.renderHistory()
  }

  // ---------- lifecycle ----------
  connectedCallback() {
    if (typeof ResizeObserver === 'function') {
      this.resize ??= new ResizeObserver(() => this.placeThumb(true))
      this.resize.observe(this.els.seg)
    }
    requestAnimationFrame(() => this.placeThumb(true))
  }

  disconnectedCallback() {
    this.resize?.disconnect()
  }

  attributeChangedCallback() {
    this.readAttributes()
  }

  private readAttributes() {
    const mx = parseInt(this.getAttribute('max-dice') ?? '', 10)
    this.max = mx > 0 ? Math.min(mx, 100) : 24
    const hs = parseInt(this.getAttribute('history-size') ?? '', 10)
    this.historyMax = hs >= 0 ? hs : 8
    this.sync()
  }

  // ---------- public API ----------
  get modifier() {
    return this.mod
  }

  set modifier(v: number) {
    v = clampModifier(+v)
    if (v === this.mod || this.rolling) return
    this.mod = v
    this.invalidate()
    this.sync()
    if (!reducedMotion()) {
      this.els.mod.animate([{ transform: 'scale(1.3)' }, { transform: 'none' }], {
        duration: 220,
        easing: 'cubic-bezier(.3,1.6,.5,1)',
      })
    }
    this.emitChange()
  }

  get mode(): RollMode {
    return this.rollMode
  }

  set mode(v: RollMode) {
    if (!MODES.includes(v) || v === this.rollMode || this.rolling) return
    this.rollMode = v
    if (this.hasD20()) this.invalidate()
    this.sync()
    this.emitChange()
  }

  get notation() {
    return formatNotation(
      this.pool.map((d) => d.sides),
      this.mod,
    )
  }

  get lastResult() {
    return this.last
  }

  /** "Letzte Würfe", newest first. Set it to bring back rolls kept on the device. */
  get history(): readonly DiceHistoryEntry[] {
    return this.entries
  }

  set history(entries: readonly DiceHistoryEntry[]) {
    this.entries = entries.slice(0, this.historyMax)
    this.renderHistory()
  }

  /** Whether dice are tumbling right now. */
  get busy() {
    return this.rolling
  }

  add(sides: number, count = 1) {
    if (!isSides(sides) || this.rolling) return
    const k = Math.min(Math.max(1, Math.floor(count)), this.max - this.pool.length)
    if (k <= 0) return
    this.invalidate()
    const added: HTMLButtonElement[] = []
    this.flip(() => {
      for (let c = 0; c < k; c++) {
        const d = this.newDie(sides)
        const idx = this.pool.findIndex((p) => p.sides > sides)
        if (idx < 0) {
          this.pool.push(d)
          this.els.dice.appendChild(d.el)
        } else {
          this.els.dice.insertBefore(d.el, this.pool[idx]!.el)
          this.pool.splice(idx, 0, d)
        }
        added.push(d.el)
      }
      this.sizeDice()
      this.sync()
    })
    if (!reducedMotion()) {
      const pick = this.els.picks[SIDES.indexOf(sides)]!
      const f = pick.querySelector('svg')!.getBoundingClientRect()
      added.forEach((el, i) => {
        const l = el.getBoundingClientRect()
        const dx = f.left + f.width / 2 - (l.left + l.width / 2)
        const dy = f.top + f.height / 2 - (l.top + l.height / 2)
        const s = f.width / (l.width || 1)
        el.animate(
          [
            { transform: `translate(${dx}px,${dy}px) scale(${s}) rotate(-140deg)` },
            { transform: 'translate(0,0) scale(1.1) rotate(8deg)', offset: 0.72 },
            { transform: 'none' },
          ],
          { duration: 440, delay: i * 40, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' },
        )
      })
      pick
        .querySelector('.badge')!
        .animate([{ transform: 'scale(1.45)' }, { transform: 'scale(1)' }], {
          duration: 280,
          easing: 'cubic-bezier(.3,1.6,.5,1)',
        })
    }
    this.emitChange()
  }

  /** Takes one die of this kind out of the tray (named so it doesn't hide Element.remove). */
  removeOne(sides: number) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      if (this.pool[i]!.sides === sides) {
        this.removeDie(this.pool[i]!)
        return
      }
    }
  }

  clear() {
    if (this.rolling) return
    const els = this.pool.map((d) => d.el)
    const reduce = reducedMotion()
    this.detachAll(els)
    this.pool = []
    this.rolled = false
    this.mod = 0
    els.forEach((el, i) => {
      if (reduce) return el.remove()
      void play(
        el,
        [
          { transform: 'none', opacity: 1 },
          { transform: 'translateY(16px) scale(.4) rotate(20deg)', opacity: 0 },
        ],
        { duration: 220, delay: i * 16, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' },
      ).then(() => el.remove())
    })
    this.sizeDice()
    this.resetReadout()
    this.sync()
    this.emitChange()
  }

  setNotation(text: string) {
    if (this.rolling) return
    const { dice, modifier } = parseNotation(text)
    this.pool.forEach((d) => d.el.remove())
    this.pool = []
    this.rolled = false
    dice
      .sort((a, b) => a - b)
      .slice(0, this.max)
      .forEach((s) => {
        const d = this.newDie(s)
        this.pool.push(d)
        this.els.dice.appendChild(d.el)
      })
    this.mod = modifier
    this.sizeDice()
    this.resetReadout()
    this.sync()
    if (!reducedMotion()) {
      this.pool.forEach((d, i) =>
        d.el.animate(POP, {
          duration: 340,
          delay: i * 35,
          easing: 'cubic-bezier(.3,.9,.4,1)',
          fill: 'backwards',
        }),
      )
    }
    this.emitChange()
  }

  async roll(): Promise<DiceRollResult | null> {
    if (this.rolling || !this.pool.length) return null
    this.rolling = true
    const reduce = reducedMotion()
    const mode = this.hasD20() ? this.rollMode : 'normal'

    for (const d of this.pool) {
      const result = d.sides === 20 ? rollD20(mode) : { value: rollDie(d.sides), dropped: null }
      d.value = result.value
      d.dropped = result.dropped
      d.el.classList.remove('crit', 'fumble', 'idle')
      d.el.querySelector('.drop')!.classList.remove('on')
    }
    // The tray only glows when the roll is one or the other; a 20 and a 1 together keep
    // their effects on the dice
    const nat = (v: number) => this.pool.some((d) => d.sides === 20 && d.value === v)
    this.trayFx = nat(20) === nat(1) ? null : nat(20) ? 'glory' : 'doom'
    this.rolled = false
    this.resetReadout()
    this.els.dice.classList.toggle('has-drops', mode !== 'normal')
    this.els.expr.textContent = displayNotation(this.notation)
    this.els.msg.textContent = ''
    this.sync()
    if (canVibrate() && vibrationEnabled()) {
      try {
        navigator.vibrate(12)
      } catch {
        // Not allowed right now; it's only a nicety.
      }
    }

    const stagger = Math.min(70, 480 / this.pool.length)
    await Promise.all(this.pool.map((d, i) => this.tumble(d, reduce ? 0 : i * stagger, reduce)))

    const res = this.result(mode)
    this.els.expr.innerHTML = breakdownHtml(res.groups, res.modifier)
    const m = this.els.msg
    m.className = 'msg'
    if (res.natural20 && res.natural1) {
      m.textContent = t.natural20And1
      m.classList.add('crit')
    } else if (res.natural20) {
      m.textContent = t.natural20
      m.classList.add('crit')
    } else if (res.natural1) {
      m.textContent = t.natural1
      m.classList.add('fumble')
    } else m.textContent = t.rolledWith[mode]

    await this.countUp(res.total, reduce)

    this.last = res
    if (this.historyMax) {
      this.entries = [
        {
          notation: res.notation,
          mode: res.mode,
          modifier: res.modifier,
          total: res.total,
          groups: res.groups,
        },
        ...this.entries,
      ].slice(0, this.historyMax)
      this.renderHistory()
    }
    this.els.sr.textContent = t.announce(displayNotation(res.notation), res.total, m.textContent)
    this.rolling = false
    this.rolled = true
    this.sync()
    this.emit('dice-roll', res)
    return res
  }

  // ---------- internals ----------
  private build() {
    const picks = SIDES.map(
      (s) =>
        `<button type="button" class="pick" data-sides="${s}">${dieSvg(s)}<span class="lbl">${dieName(s)}</span><span class="badge" aria-hidden="true"></span></button>`,
    ).join('')
    const modeButtons = MODES.map(
      (m) => `<button type="button" data-mode="${m}">${t.mode[m]}</button>`,
    ).join('')
    this.shadowRoot!.innerHTML = `<style>${DICE_ROLLER_CSS}</style>
      <div class="wrap" part="root">
        <section class="tray" part="tray" aria-label="${t.tray}">
          <div class="dice"><p class="empty">${t.empty}</p></div>
          <div class="result">
            <div class="readout"><div class="msg"></div><div class="expr"></div></div>
            <div class="total stale" part="total" aria-hidden="true">–</div>
          </div>
        </section>
        <div class="picker" part="picker" role="group" aria-label="${t.picker}">${picks}</div>
        <div class="row">
          <div class="stepper" role="group" aria-label="${t.modifier}">
            <span class="steplabel">${t.modifier}</span>
            <button type="button" data-step="-1" aria-label="${t.decrease}">−</button>
            <output aria-live="polite">0</output>
            <button type="button" data-step="1" aria-label="${t.increase}">+</button>
          </div>
          <div class="seg" role="group" aria-label="${t.modes}" title="${t.modesHint}">
            <span class="thumb" aria-hidden="true"></span>${modeButtons}
          </div>
        </div>
        <div class="actions">
          <button type="button" class="btn clear">${t.clear}</button>
          <button type="button" class="btn roll" part="roll"></button>
        </div>
        <details class="history"><summary>${t.history} <span class="hcount"></span></summary><ol></ol></details>
        <div class="sr" aria-live="polite"></div>
      </div>`
    const root = this.shadowRoot!
    const $ = <E extends Element = HTMLElement>(q: string) => root.querySelector<E>(q)!
    this.els = {
      tray: $('.tray'),
      dice: $('.dice'),
      empty: $('.empty'),
      msg: $('.msg'),
      expr: $('.expr'),
      total: $('.total'),
      picks: [...root.querySelectorAll<HTMLButtonElement>('.pick')],
      mod: $<HTMLOutputElement>('output'),
      seg: $('.seg'),
      thumb: $('.thumb'),
      modes: [...root.querySelectorAll<HTMLButtonElement>('[data-mode]')],
      clear: $<HTMLButtonElement>('.clear'),
      roll: $<HTMLButtonElement>('.roll'),
      hist: $<HTMLOListElement>('.history ol'),
      hcount: $('.hcount'),
      sr: $('.sr'),
    }
    this.els.picks.forEach((b) => {
      const s = Number(b.dataset.sides) as Sides
      this.face(b, s, s === 100 ? '%' : s, false)
      // Right-click or a long press takes one out again
      b.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        this.removeOne(s)
      })
    })
    root.addEventListener('click', (e) => this.onClick(e))
  }

  private onClick(e: Event) {
    const b = (e.target as Element).closest('button')
    if (!b) return
    if (b.classList.contains('pick')) this.add(Number(b.dataset.sides))
    else if (b.classList.contains('die')) {
      const d = this.pool.find((p) => p.id === Number(b.dataset.id))
      if (d) this.removeDie(d)
    } else if (b.dataset.step) this.modifier = this.mod + Number(b.dataset.step)
    else if (b.dataset.mode) this.mode = b.dataset.mode as RollMode
    else if (b.classList.contains('clear')) this.clear()
    else if (b.classList.contains('roll')) void this.roll()
    else if (b.classList.contains('again')) {
      const h = this.entries[Number(b.dataset.i)]
      if (!h || this.rolling) return
      if (h.groups.some((g) => g.sides === 20)) this.mode = h.mode
      this.setNotation(h.notation)
      const reduce = reducedMotion()
      this.els.tray.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
      setTimeout(() => void this.roll(), reduce ? 0 : 280)
    }
  }

  private newDie(sides: Sides): PoolDie {
    const b = document.createElement('button')
    const d: PoolDie = { id: ++this.uid, sides, value: null, dropped: null, el: b }
    b.type = 'button'
    b.className = 'die idle'
    b.dataset.id = String(d.id)
    b.innerHTML = `<span class="shadow"></span><span class="aura"></span><span class="tumble">${dieSvg(sides)}</span><span class="rm" aria-hidden="true">×</span><span class="drop"></span>`
    this.face(b, sides, null, true)
    this.label(d)
    return d
  }

  private face(el: Element, sides: Sides, val: number | string | null, idle: boolean) {
    const text = el.querySelector('.num')!
    const ul = el.querySelector('.ul')!
    const s = SHAPES[sides]
    const str = idle ? dieName(sides) : String(val)
    const k = idle ? 0.6 : str.length <= 1 ? 1 : str.length === 2 ? 0.84 : 0.66
    const fs = s.fs * k
    text.textContent = str
    text.setAttribute('font-size', fs.toFixed(1))
    // Real dice underline 6 and 9 so they can be told apart
    const under = !idle && sides >= 8 && sides !== 100 && (val === 6 || val === 9)
    ul.setAttribute('visibility', under ? 'visible' : 'hidden')
    if (under) ul.setAttribute('y', (s.c[1] + fs * 0.42).toFixed(1))
  }

  private label(d: PoolDie) {
    d.el.setAttribute('aria-label', t.die(dieName(d.sides), d.value, d.dropped))
  }

  private tumble(d: PoolDie, delay: number, reduce: boolean): Promise<void> {
    return new Promise((done) => {
      const el = d.el
      if (reduce) {
        this.land(d, true)
        void play(el, [{ opacity: 0.3 }, { opacity: 1 }], { duration: 160 })
        return done()
      }
      const tumble = el.querySelector('.tumble')!
      const shadow = el.querySelector('.shadow')!
      const dur = 680 + Math.random() * 280
      const spin = (Math.random() < 0.5 ? -1 : 1) * 360 * (Math.random() < 0.4 ? 2 : 1)
      const jx = () => (Math.random() * 2 - 1) * 10
      const easing = 'cubic-bezier(.25,.6,.35,1)'
      const anim = tumble.animate(
        [
          { offset: 0, transform: 'translate(0,0) rotate(0deg) scale(1)' },
          {
            offset: 0.22,
            transform: `translate(${jx()}px,-30px) rotate(${spin * 0.4}deg) scale(1.1)`,
          },
          {
            offset: 0.46,
            transform: `translate(${jx()}px,0) rotate(${spin * 0.72}deg) scale(.95)`,
          },
          {
            offset: 0.63,
            transform: `translate(${jx() / 2}px,-11px) rotate(${spin * 0.88}deg) scale(1.03)`,
          },
          { offset: 0.8, transform: `translate(0,0) rotate(${spin * 0.97}deg) scale(.98)` },
          { offset: 1, transform: `translate(0,0) rotate(${spin}deg) scale(1)` },
        ],
        { duration: dur, delay, easing },
      )
      shadow.animate(
        [
          { offset: 0, transform: 'scale(1)', opacity: 1 },
          { offset: 0.22, transform: 'scale(.55)', opacity: 0.4 },
          { offset: 0.46, transform: 'scale(1.06)', opacity: 1 },
          { offset: 0.63, transform: 'scale(.8)', opacity: 0.7 },
          { offset: 0.8, transform: 'scale(1)', opacity: 1 },
          { offset: 1, transform: 'scale(1)', opacity: 1 },
        ],
        { duration: dur, delay, easing },
      )

      // Faces flicker fast, then slow as the die settles
      let alive = true
      let timer: ReturnType<typeof setTimeout>
      const t0 = performance.now() + delay
      const cycle = () => {
        if (!alive) return
        const elapsed = performance.now() - t0
        this.face(el, d.sides, flicker(d.sides), false)
        timer = setTimeout(cycle, 45 + Math.max(0, elapsed / dur) * 130)
      }
      timer = setTimeout(cycle, delay)
      const finish = () => {
        alive = false
        clearTimeout(timer)
        this.land(d, false)
        done()
      }
      anim.finished.then(finish, finish)
    })
  }

  private land(d: PoolDie, reduce: boolean) {
    const el = d.el
    this.face(el, d.sides, d.value, false)
    this.label(d)
    if (!reduce) {
      el.querySelector('.tumble')!.animate(
        [{ transform: 'scale(1.14,.84)' }, { transform: 'scale(.95,1.06)' }, { transform: 'none' }],
        { duration: 280, easing: 'cubic-bezier(.3,.7,.4,1)' },
      )
    }
    if (d.dropped != null) {
      const dr = el.querySelector('.drop')!
      dr.textContent = String(d.dropped)
      dr.classList.add('on')
    }
    if (d.sides === 20 && d.value === 20) {
      el.classList.add('crit')
      this.sparks(el, reduce)
      this.trayGlow('glory')
    } else if (d.sides === 20 && d.value === 1) {
      el.classList.add('fumble')
      this.trayGlow('doom')
      if (!reduce) {
        el.animate(
          [
            { transform: 'none' },
            { transform: 'translate(0,4px) scale(1.03)', offset: 0.12 },
            { transform: 'translate(-4px,3px)', offset: 0.3 },
            { transform: 'translate(4px,2px)', offset: 0.45 },
            { transform: 'translate(-2px,1px)', offset: 0.6 },
            { transform: 'translate(1px,0)', offset: 0.78 },
            { transform: 'none' },
          ],
          { duration: 620, delay: 90, easing: 'cubic-bezier(.3,.6,.4,1)' },
        )
      }
    }
  }

  private trayGlow(kind: 'glory' | 'doom') {
    if (this.trayFx !== kind) return
    const tray = this.els.tray
    tray.classList.remove(kind)
    void tray.offsetWidth // restart the glow if it was already showing
    tray.classList.add(kind)
  }

  // Natural 20: a flash ring, light rays and a shower of embers that arc out and fall.
  // With reduced motion the rays and embers appear in place and fade, without moving.
  private sparks(el: HTMLElement, reduce: boolean) {
    const b = document.createElement('span')
    b.className = 'burst'
    const R = el.offsetWidth || 64
    const rnd = (a: number, z: number) => a + Math.random() * (z - a)
    if (reduce) {
      for (let i = 0; i < 12; i++) {
        const r = document.createElement('i')
        const len = i % 2 ? 12 : 20
        r.className = 'ray'
        Object.assign(r.style, {
          width: '3px',
          height: `${len}px`,
          margin: `${-len / 2}px 0 0 -1.5px`,
          transform: `rotate(${i * 30}deg) translateY(${-R * 0.82}px)`,
        })
        b.appendChild(r)
      }
      for (let i = 0; i < 10; i++) {
        const s = document.createElement('i')
        const size = rnd(3, 6)
        const ang = rnd(0, Math.PI * 2)
        const dist = R * rnd(0.75, 1.2)
        Object.assign(s.style, {
          width: `${size}px`,
          height: `${size}px`,
          margin: `${-size / 2}px 0 0 ${-size / 2}px`,
          transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist}px)`,
        })
        b.appendChild(s)
      }
      el.appendChild(b)
      ;[...b.children].forEach((c) => ((c as HTMLElement).style.opacity = '1'))
      const glint = [
        { opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { opacity: 1, offset: 0.55 },
        { opacity: 0 },
      ]
      void play(b, glint, { duration: 1600, easing: 'ease-in-out', fill: 'forwards' }).then(() =>
        b.remove(),
      )
      return
    }
    const parts: Animation[] = []
    const ring = document.createElement('b')
    b.appendChild(ring)
    parts.push(
      ring.animate(
        [
          { transform: 'scale(.55)', opacity: 1 },
          { transform: 'scale(2.1)', opacity: 0 },
        ],
        { duration: 560, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'both' },
      ),
    )
    for (let i = 0; i < 12; i++) {
      const r = document.createElement('i')
      const a = i * 30 + rnd(-8, 8)
      const len = rnd(14, 22)
      r.className = 'ray'
      Object.assign(r.style, {
        width: '3px',
        height: `${len}px`,
        margin: `${-len / 2}px 0 0 -1.5px`,
      })
      b.appendChild(r)
      parts.push(
        r.animate(
          [
            { transform: `rotate(${a}deg) translateY(${-R * 0.42}px) scaleY(.3)`, opacity: 1 },
            { transform: `rotate(${a}deg) translateY(${-R * 1.25}px) scaleY(1)`, opacity: 0 },
          ],
          { duration: rnd(520, 700), easing: 'cubic-bezier(.15,.8,.3,1)', fill: 'both' },
        ),
      )
    }
    for (let i = 0; i < 22; i++) {
      const s = document.createElement('i')
      const size = rnd(3, 7)
      const ang = rnd(0, Math.PI * 2)
      const dist = R * rnd(0.75, 1.7)
      const dx = Math.cos(ang) * dist
      const dy = Math.sin(ang) * dist
      Object.assign(s.style, {
        width: `${size}px`,
        height: `${size}px`,
        margin: `${-size / 2}px 0 0 ${-size / 2}px`,
      })
      b.appendChild(s)
      parts.push(
        s.animate(
          [
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            {
              transform: `translate(${dx * 0.8}px,${dy * 0.8}px) scale(1)`,
              opacity: 1,
              offset: 0.45,
            },
            { transform: `translate(${dx}px,${dy + R * 0.45}px) scale(.2)`, opacity: 0 },
          ],
          {
            duration: rnd(800, 1300),
            delay: rnd(0, 120),
            easing: 'cubic-bezier(.12,.75,.4,1)',
            fill: 'both',
          },
        ),
      )
    }
    el.appendChild(b)
    Promise.all(parts.map((p) => p.finished)).then(
      () => b.remove(),
      () => b.remove(),
    )
  }

  private countUp(target: number, reduce: boolean): Promise<void> {
    const el = this.els.total
    el.classList.remove('stale')
    if (reduce) {
      el.textContent = String(target)
      return Promise.resolve()
    }
    return new Promise((done) => {
      const start = performance.now()
      const dur = Math.min(700, 280 + Math.abs(target) * 8)
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / dur)
        el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))))
        if (p < 1) return void requestAnimationFrame(step)
        el.animate([{ transform: 'scale(1.22)' }, { transform: 'none' }], {
          duration: 300,
          easing: 'cubic-bezier(.3,1.5,.5,1)',
        })
        done()
      }
      requestAnimationFrame(step)
    })
  }

  private result(mode: RollMode): DiceRollResult {
    const dice = this.pool.map((d) => ({ sides: d.sides, value: d.value!, dropped: d.dropped }))
    const d20s = dice.filter((d) => d.sides === 20).map((d) => d.value)
    return {
      notation: this.notation,
      mode,
      modifier: this.mod,
      total: dice.reduce((a, d) => a + d.value, 0) + this.mod,
      groups: groupRolls(
        dice.map((d) => ({ sides: d.sides, roll: { value: d.value, dropped: d.dropped } })),
      ),
      dice,
      natural20: d20s.includes(20),
      natural1: d20s.includes(1),
      rolledAt: new Date().toISOString(),
    }
  }

  private removeDie(d: PoolDie) {
    if (this.rolling) return
    const idx = this.pool.indexOf(d)
    if (idx < 0) return
    const hadFocus = this.shadowRoot!.activeElement === d.el
    this.invalidate()
    const el = d.el
    this.flip(() => {
      this.detachAll([el])
      this.pool.splice(idx, 1)
      this.sizeDice()
      this.sync()
    })
    if (reducedMotion()) el.remove()
    else {
      void play(
        el,
        [
          { transform: 'none', opacity: 1 },
          { transform: 'scale(.3) rotate(35deg)', opacity: 0 },
        ],
        { duration: 200, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' },
      ).then(() => el.remove())
    }
    if (hadFocus) {
      const next = this.pool[idx] ?? this.pool[idx - 1]
      ;(next ? next.el : this.els.picks[SIDES.indexOf(d.sides)]!).focus({ preventScroll: true })
    }
    this.emitChange()
  }

  // Pull leaving dice out of the flow at their current spot so the rest can reflow at once
  private detachAll(els: HTMLElement[]) {
    const box = this.els.dice.getBoundingClientRect()
    const rects = els.map((el) => el.getBoundingClientRect())
    els.forEach((el, i) => {
      const r = rects[i]!
      Object.assign(el.style, {
        position: 'absolute',
        left: `${r.left - box.left}px`,
        top: `${r.top - box.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
        pointerEvents: 'none',
        transition: 'none',
      })
      el.tabIndex = -1
    })
  }

  // FLIP: animate remaining dice from where they were to where they now are
  private flip(mutate: () => void) {
    const reduce = reducedMotion()
    const before = new Map<HTMLElement, DOMRect>()
    if (!reduce) this.pool.forEach((d) => before.set(d.el, d.el.getBoundingClientRect()))
    mutate()
    if (reduce) return
    for (const d of this.pool) {
      const f = before.get(d.el)
      if (!f) continue
      const l = d.el.getBoundingClientRect()
      const dx = f.left + f.width / 2 - (l.left + l.width / 2)
      const dy = f.top + f.height / 2 - (l.top + l.height / 2)
      const sc = f.width / (l.width || 1)
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sc - 1) < 0.01) continue
      d.el.animate(
        [{ transform: `translate(${dx}px,${dy}px) scale(${sc})` }, { transform: 'none' }],
        {
          duration: 280,
          easing: 'cubic-bezier(.2,.8,.2,1)',
        },
      )
    }
  }

  private invalidate() {
    if (!this.rolled) return
    this.rolled = false
    for (const d of this.pool) {
      d.value = null
      d.dropped = null
      d.el.classList.remove('crit', 'fumble')
      d.el.classList.add('idle')
      d.el.querySelector('.drop')!.classList.remove('on')
      this.face(d.el, d.sides, null, true)
      this.label(d)
    }
    this.resetReadout()
  }

  private resetReadout() {
    this.els.total.textContent = '–'
    this.els.total.classList.add('stale')
    this.els.msg.className = 'msg'
    this.els.dice.classList.remove('has-drops')
    this.els.tray.classList.remove('doom', 'glory')
  }

  private sizeDice() {
    const n = this.pool.length
    this.els.dice.style.setProperty('--die', `${n <= 6 ? 64 : n <= 10 ? 56 : n <= 16 ? 48 : 42}px`)
  }

  private counts(): Map<Sides, number> {
    const c = new Map<Sides, number>()
    for (const d of this.pool) c.set(d.sides, (c.get(d.sides) ?? 0) + 1)
    return c
  }

  private hasD20() {
    return this.pool.some((d) => d.sides === 20)
  }

  private sync() {
    if (!this.els) return
    const n = this.pool.length
    const c = this.counts()
    const full = n >= this.max
    for (const b of this.els.picks) {
      const s = Number(b.dataset.sides) as Sides
      const k = c.get(s) ?? 0
      const badge = b.querySelector('.badge')!
      if (k) badge.textContent = String(k)
      badge.classList.toggle('on', k > 0)
      b.disabled = this.rolling || full
      b.setAttribute('aria-label', t.add(dieName(s), k))
    }
    this.els.empty.classList.toggle('off', n > 0)
    this.els.tray.classList.toggle('busy', this.rolling)
    this.els.mod.textContent = this.mod > 0 ? `+${this.mod}` : this.mod < 0 ? `−${-this.mod}` : '0'
    this.els.clear.disabled = this.rolling || (!n && !this.mod)
    const r = this.els.roll
    r.disabled = this.rolling || !n
    r.textContent = this.rolling
      ? t.rolling
      : !n
        ? t.pickDice
        : this.rolled
          ? t.rollAgain
          : t.roll(n)
    this.els.seg.classList.toggle('dim', !this.hasD20())
    for (const b of this.els.modes) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === this.rollMode))
      b.disabled = this.rolling
    }
    this.placeThumb(false)
    if (!this.rolled && !this.rolling) {
      this.els.expr.textContent = displayNotation(this.notation)
      this.els.msg.textContent = full ? t.limit(this.max) : n ? t.tapToRemove : ''
    }
  }

  private placeThumb(instant: boolean) {
    const b = this.els.modes.find((x) => x.dataset.mode === this.rollMode)
    const thumb = this.els.thumb
    if (!b || !b.offsetWidth) return
    if (instant) thumb.style.transition = 'none'
    thumb.style.left = `${b.offsetLeft}px`
    thumb.style.width = `${b.offsetWidth}px`
    if (instant) {
      void thumb.offsetWidth
      thumb.style.transition = ''
    }
  }

  private renderHistory() {
    const h = this.entries
    this.els.hcount.textContent = h.length ? `(${h.length})` : ''
    this.els.hist.innerHTML = h.length
      ? h
          .map((x, i) => {
            const notation = escapeHtml(displayNotation(x.notation))
            const hasD20 = x.groups.some((g) => g.sides === 20)
            const mode =
              hasD20 && x.mode !== 'normal'
                ? ` <span class="h-mode">${t.withMode[x.mode]}</span>`
                : ''
            return (
              `<li><div><div class="h-expr">${notation}${mode}</div>` +
              `<div class="h-vals">${breakdownHtml(x.groups, x.modifier)}</div></div><span class="h-total">${Number(x.total)}</span>` +
              `<button type="button" class="again" data-i="${i}" aria-label="${escapeHtml(t.againLabel(displayNotation(x.notation)))}">${t.again}</button></li>`
            )
          })
          .join('')
      : `<li class="none">${t.historyEmpty}</li>`
  }

  private emit(name: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }))
  }

  private emitChange() {
    this.emit('dice-change', {
      notation: this.notation,
      dice: this.pool.map((d) => d.sides),
      modifier: this.mod,
      mode: this.rollMode,
    })
  }
}

/** Registers <dice-roller> once. */
export function defineDiceRoller(): void {
  if (!customElements.get('dice-roller')) customElements.define('dice-roller', DiceRoller)
}
