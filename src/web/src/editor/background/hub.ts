// The image hub's SignalR contract, the twin of src/Server/Images/ImageHub.cs. The editor
// connects only while one of its map's background jobs is queued or running, and stops the
// connection when none is left: an open connection keeps the scale-to-zero server awake.
// The checks below fail to compile when these maps and the server's interfaces drift apart.
import type { HubConnection } from '@microsoft/signalr'
import type {
  HubResult,
  ImageHubClientMethod,
  ImageHubMethod,
  MapBackground,
} from '../../api/types'

export const IMAGE_HUB_PATH = '/hubs/images'

/** Editor → server calls: their arguments and results. */
export interface ImageHubCalls {
  /** Joins the map's group; `dm` members only. Errors: notADm, itemNotFound. */
  WatchMap: { args: [campaignId: string, mapId: string]; result: HubResult }
}

/** Server → editor messages and their arguments. */
export interface ImageHubEvents {
  /** A version of the map's background is running, done or failed. */
  BackgroundUpdated: [background: MapBackground]
}

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const contractMatches: [
  Same<keyof ImageHubCalls, ImageHubMethod>,
  Same<keyof ImageHubEvents, ImageHubClientMethod>,
] = [true, true]
void contractMatches

/** Calls a hub method with the contract's argument and result types. */
export function invokeImageHub<M extends keyof ImageHubCalls>(
  connection: HubConnection,
  method: M,
  ...args: ImageHubCalls[M]['args']
): Promise<ImageHubCalls[M]['result']> {
  return connection.invoke<ImageHubCalls[M]['result']>(method, ...args)
}

/** Listens to a server message with the contract's argument types. Returns the unsubscribe. */
export function onImageHubEvent<E extends keyof ImageHubEvents>(
  connection: HubConnection,
  event: E,
  handler: (...args: ImageHubEvents[E]) => void,
): () => void {
  const listener = handler as (...args: unknown[]) => void
  connection.on(event, listener)
  return () => connection.off(event, listener)
}
