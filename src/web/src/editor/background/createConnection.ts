// The real SignalR connection to the image hub, set up like the table's
// (table/createConnection.ts): same origin, so the sign-in cookie goes along; JSON
// protocol; no automatic reconnect (watch.ts decides when). Its own module so tests can
// swap it for a fake (vi.mock).
import { HubConnectionBuilder, LogLevel, type HubConnection } from '@microsoft/signalr'
import { IMAGE_HUB_PATH } from './hub'

export function createImageConnection(): HubConnection {
  return new HubConnectionBuilder()
    .withUrl(IMAGE_HUB_PATH)
    .configureLogging(LogLevel.Warning)
    .build()
}
