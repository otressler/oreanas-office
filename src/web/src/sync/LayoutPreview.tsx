// A small picture of a map's layout: terrain as coloured squares and features as outlines.
// Plain SVG, so it works offline and doesn't pull the Konva board into the app shell.
import type { MapLayout } from '../api/types'
import { FEATURE_COLORS, TABLE_COLOR, TERRAIN_COLORS } from '../board/palette'

export function LayoutPreview({
  width,
  height,
  layout,
  label,
}: {
  width: number
  height: number
  layout: MapLayout
  label: string
}) {
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      className="max-h-48 w-full rounded-lg border border-line"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width={width} height={height} fill={TABLE_COLOR} />
      {layout.cells.map((cell) =>
        cell.terrain === 'void' ? null : (
          <rect
            key={`${cell.x},${cell.y}`}
            x={cell.x}
            y={cell.y}
            width={1}
            height={1}
            fill={TERRAIN_COLORS[cell.terrain]}
          />
        ),
      )}
      {layout.features.map((feature) => (
        <rect
          key={feature.id}
          x={feature.x + 0.1}
          y={feature.y + 0.1}
          width={Math.max(feature.w - 0.2, 0.2)}
          height={Math.max(feature.h - 0.2, 0.2)}
          fill={FEATURE_COLORS.surface}
          stroke={FEATURE_COLORS.surfaceLine}
          strokeWidth={0.08}
        />
      ))}
    </svg>
  )
}
