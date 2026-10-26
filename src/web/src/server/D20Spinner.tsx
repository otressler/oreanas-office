import { useEffect, useRef } from 'react'

// A wireframe d20 (icosahedron) that spins about its upright axis while the server
// wakes up. Each loop: a short wind-up the other way, three full turns that slow
// down, a small overshoot that springs back, then a rest. Three full turns end
// where they started, so the loop is seamless. Only the edges of faces turned
// towards the viewer are drawn, as plain lines; a blurred copy pulses behind them.

const PHI = (1 + Math.sqrt(5)) / 2

type Vec = [number, number, number]

/** The 12 corners: (0, ±1, ±φ) and its cyclic permutations, scaled to radius 1. */
const RAW: Vec[] = []
for (const a of [-1, 1]) for (const b of [-PHI, PHI]) RAW.push([0, a, b], [a, b, 0], [b, 0, a])

const dist = (p: Vec, q: Vec) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
const cross = (u: Vec, v: Vec): Vec => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
]
const sub = (p: Vec, q: Vec): Vec => [p[0] - q[0], p[1] - q[1], p[2] - q[2]]
const dot = (u: Vec, v: Vec) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2]

const unit = (v: Vec): Vec => {
  const r = Math.hypot(...v)
  return [v[0] / r, v[1] / r, v[2] / r]
}

/** The 20 faces as corner indices, wound counter-clockwise seen from outside. */
const FACES: [number, number, number][] = (() => {
  const near = (i: number, j: number) => Math.abs(dist(RAW[i], RAW[j]) - 2) < 1e-6
  const faces: [number, number, number][] = []
  const n = RAW.length
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        if (!near(i, j) || !near(j, k) || !near(i, k)) continue
        const [a, b, c] = [RAW[i], RAW[j], RAW[k]]
        const outward = dot(cross(sub(b, a), sub(c, a)), a) > 0
        faces.push(outward ? [i, j, k] : [i, k, j])
      }
  return faces
})()

/**
 * Corners on the unit sphere, turned into the classic d20 pose: one face looks
 * straight at the viewer with a corner pointing up, so the outline is a hexagon.
 */
const VERTICES: Vec[] = (() => {
  const [i, j, k] = FACES[0]
  const front = unit([0, 1, 2].map((d) => RAW[i][d] + RAW[j][d] + RAW[k][d]) as Vec)
  const corner = RAW[i]
  const up = unit(sub(corner, front.map((d) => d * dot(corner, front)) as Vec))
  const right = cross(up, front)
  return RAW.map(unit).map((v) => [dot(v, right), dot(v, up), dot(v, front)])
})()

/** Distance of the eye from the centre, in radii; small enough for a hint of depth. */
const EYE = 5

const CYCLE_MS = 4600
const WIND_UP_MS = 450
const SPIN_MS = 3400
const WIND_UP_DEG = 18
const TURNS_DEG = 3 * 360
/** easeOutBack strength; about 11° past the end before springing back. */
const OVERSHOOT = 0.55

function easeInOutSine(x: number) {
  return -(Math.cos(Math.PI * x) - 1) / 2
}

function easeOutBack(x: number) {
  const u = x - 1
  return 1 + (OVERSHOOT + 1) * u ** 3 + OVERSHOOT * u ** 2
}

/** The spin angle in degrees at `ms` into a loop. */
function spinAngle(ms: number): number {
  const t = ms % CYCLE_MS
  if (t < WIND_UP_MS) return -WIND_UP_DEG * easeInOutSine(t / WIND_UP_MS)
  if (t < WIND_UP_MS + SPIN_MS) {
    const p = (t - WIND_UP_MS) / SPIN_MS
    return -WIND_UP_DEG + (TURNS_DEG + WIND_UP_DEG) * easeOutBack(p)
  }
  return TURNS_DEG
}

/** SVG path data for the visible edges of the d20 turned `deg` about its axis. */
function d20Path(deg: number): string {
  const yaw = (deg * Math.PI) / 180
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  // Screen points with y up; flipped to SVG's y-down when written out.
  const points = VERTICES.map(([x, y, z]) => {
    const x1 = x * cy + z * sy
    const z1 = z * cy - x * sy
    const scale = EYE / (EYE - z1)
    return [x1 * scale, y * scale] as const
  })
  const drawn = new Set<string>()
  let d = ''
  for (const [i, j, k] of FACES) {
    const [a, b, c] = [points[i], points[j], points[k]]
    const facing = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0
    if (!facing) continue
    for (const [p, q] of [
      [i, j],
      [j, k],
      [k, i],
    ]) {
      const key = p < q ? `${p}-${q}` : `${q}-${p}`
      if (drawn.has(key)) continue
      drawn.add(key)
      const [px, py] = points[p]
      const [qx, qy] = points[q]
      d += `M${px.toFixed(4)} ${(-py).toFixed(4)}L${qx.toFixed(4)} ${(-qy).toFixed(4)}`
    }
  }
  return d
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** The waking screen's busy indicator. Stands still for reduced motion. */
export function D20Spinner({ className }: { className?: string }) {
  const glow = useRef<SVGPathElement>(null)
  const lines = useRef<SVGPathElement>(null)

  useEffect(() => {
    if (prefersReducedMotion()) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const d = d20Path(spinAngle(now - start))
      glow.current?.setAttribute('d', d)
      lines.current?.setAttribute('d', d)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const rest = d20Path(0)
  return (
    <svg
      aria-hidden="true"
      viewBox="-1.4 -1.4 2.8 2.8"
      className={className}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <filter id="d20-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.07" />
        </filter>
      </defs>
      <path
        ref={glow}
        d={rest}
        filter="url(#d20-glow)"
        className="stroke-candle-strong motion-safe:animate-d20-glow"
        strokeWidth={0.12}
      />
      <path ref={lines} d={rest} className="stroke-candle" strokeWidth={0.035} />
    </svg>
  )
}
