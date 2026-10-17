// What page tests do on FakeTableBoard that has no button: double taps and arrows, as the
// real board reports them. The mounted fake board fills these in; tests call them inside
// act().
import type { GridPoint } from '../board/geometry'

export interface FakeBoardControls {
  /** The second touch of a double tap on `cell`, lifted at once: takes back, then pings. */
  doubleTap: (cell: GridPoint) => void
  /** A double tap dragged from `from` to `to`: takes back, then the arrow as reported. */
  arrow: (from: GridPoint, to: GridPoint, done: boolean) => void
}

const unmounted = () => {
  throw new Error('No FakeTableBoard is mounted')
}

export const fakeBoard: FakeBoardControls = { doubleTap: unmounted, arrow: unmounted }
