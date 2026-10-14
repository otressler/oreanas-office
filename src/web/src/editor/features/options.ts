// What the feature and entrance tools give the next thing they place, set in their
// panels. Kept for the whole visit, across maps, so a run of pillars needs one setup.
import { createStore, useStore } from 'zustand'
import { de } from '../../text/de'
import type { EntranceKind, FeatureProps } from './layout'

export interface PlacementOptions {
  feature: Pick<FeatureProps, 'kind' | 'label' | 'elevation' | 'blocksMovement'>
  entrance: { kind: EntranceKind; label: string }
}

export const DEFAULT_OPTIONS: PlacementOptions = {
  feature: { kind: de.editorFeatures.kinds.bridge, label: '', elevation: 0, blocksMovement: false },
  entrance: { kind: 'entrance', label: '' },
}

export const placementOptions = createStore<PlacementOptions>()(() => DEFAULT_OPTIONS)

export function setFeatureOptions(patch: Partial<PlacementOptions['feature']>) {
  placementOptions.setState((s) => ({ feature: { ...s.feature, ...patch } }))
}

export function setEntranceOptions(patch: Partial<PlacementOptions['entrance']>) {
  placementOptions.setState((s) => ({ entrance: { ...s.entrance, ...patch } }))
}

/** Back to the defaults; for tests. */
export function resetPlacementOptions() {
  placementOptions.setState(DEFAULT_OPTIONS, true)
}

export function usePlacementOptions<T>(selector: (options: PlacementOptions) => T): T {
  return useStore(placementOptions, selector)
}
