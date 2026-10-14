// A larger view of the finished versions, one at a time with previous and next, so the DM
// can compare them. The map's grid lies over the picture at the version's frame, as the
// board draws it, so the fit is visible; padding outside the map is dimmed.
import { useMemo, useState } from 'react'
import type { MapBackground } from '../../api/types'
import { buildScene } from '../../board/scene'
import { Badge, Button } from '../../components/ui'
import { formatDateTime } from '../../lib/dates'
import { Modal } from '../../sync/Modal'
import { de } from '../../text/de'
import type { EditorMap } from '../model'

const t = de.maps.background

export function CompareDialog({
  versions,
  startId,
  pickedId,
  doc,
  onClose,
}: {
  /** Done versions with a picture, newest first. */
  versions: MapBackground[]
  startId: string
  pickedId: string | null
  doc: EditorMap
  onClose: () => void
}) {
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      versions.findIndex((v) => v.id === startId),
    ),
  )
  const version = versions[Math.min(index, versions.length - 1)]
  if (!version) return null
  const time = formatDateTime(version.createdAt)
  return (
    <Modal title={t.compare.title} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="tabular-nums">{t.compare.position(index + 1, versions.length)}</span>
        <span className="text-dim">{time}</span>
        {version.id === pickedId && <Badge tone="candle">{t.picked}</Badge>}
        {version.layoutChanged && <span className="text-dim">{t.layoutChanged}</span>}
      </div>
      <Framed version={version} doc={doc} alt={t.versionAlt(time)} />
      <p className="text-xs text-dim">{t.compare.grid}</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={index === 0} onClick={() => setIndex(index - 1)}>
          {t.compare.previous}
        </Button>
        <Button disabled={index >= versions.length - 1} onClick={() => setIndex(index + 1)}>
          {t.compare.next}
        </Button>
        <Button className="ml-auto" onClick={onClose}>
          {t.compare.close}
        </Button>
      </div>
    </Modal>
  )
}

/** The picture with the grid of the map size it was made for, in map cells. */
function Framed({ version, doc, alt }: { version: MapBackground; doc: EditorMap; alt: string }) {
  const { x, y, width, height, gridWidth, gridHeight } = version
  // The layout's edges help judge the fit, but only for a map of the picture's size.
  const sameSize = doc.width === gridWidth && doc.height === gridHeight
  const rims = useMemo(() => (sameSize ? buildScene(doc).rims : []), [sameSize, doc])
  const lines: string[] = []
  for (let i = 0; i <= gridWidth; i++) lines.push(`M${i} 0V${gridHeight}`)
  for (let j = 0; j <= gridHeight; j++) lines.push(`M0 ${j}H${gridWidth}`)
  // Everything in the frame outside the map: the padding of a wide map.
  const padding = `M${x} ${y}h${width}v${height}h${-width}Z M0 0v${gridHeight}h${gridWidth}v${-gridHeight}Z`
  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border border-line bg-table"
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <img src={version.url ?? ''} alt={alt} className="absolute inset-0 h-full w-full" />
      <svg
        aria-hidden="true"
        data-testid="compare-grid"
        viewBox={`${x} ${y} ${width} ${height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <path d={padding} fill="rgba(0, 0, 0, 0.55)" fillRule="evenodd" />
        <path
          d={lines.join('')}
          fill="none"
          stroke="rgba(10, 11, 14, 0.7)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={rims.map((s) => `M${s.x1} ${s.y1}L${s.x2} ${s.y2}`).join('')}
          fill="none"
          stroke="rgba(240, 196, 110, 0.9)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  )
}
