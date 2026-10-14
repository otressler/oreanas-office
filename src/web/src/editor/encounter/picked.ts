// The creature type the placement tool puts down next, picked in its panel. Kept for the
// whole visit, across encounters, so a run of goblins needs one pick. It holds a copy of
// the type's name and size (what a new token takes over); the panel keeps it current and
// clears it when the type is archived or belongs to another campaign.
import { createStore, useStore } from 'zustand'
import type { PlaceableType } from './tokens'

export interface PickedState {
  type: PlaceableType | null
  /** The campaign the type belongs to, when known. */
  campaignId: string | null
}

export const pickedType = createStore<PickedState>()(() => ({ type: null, campaignId: null }))

export function pickType(type: (PlaceableType & { campaignId?: string }) | null) {
  pickedType.setState({
    type: type && { id: type.id, name: type.name, size: type.size },
    campaignId: type?.campaignId ?? null,
  })
}

export function usePickedState(): PickedState {
  return useStore(pickedType)
}
