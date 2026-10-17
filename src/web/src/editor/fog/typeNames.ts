// The names of the campaign's creature types, for showing a creature without its number: the
// type's name is what an automatic label starts with. Offline, from the browser's bestiary; the
// editor's canvas also renders where no local user is provided (then without names).
import { useLiveQuery } from 'dexie-react-hooks'
import { useContext } from 'react'
import { listCreatureTypes } from '../../bestiary/creatureTypes'
import { LocalUserContext } from '../../offline/localUser'

export function useTypeNames(campaignId: string | null): ReadonlyMap<string, string> {
  const local = useContext(LocalUserContext)
  const db = local?.db
  const types = useLiveQuery(
    () => (db && campaignId ? listCreatureTypes(db, campaignId) : []),
    [db, campaignId],
  )
  return new Map((types ?? []).map((type) => [type.id, type.name]))
}
