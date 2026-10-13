// The real SignalR connection to the table hub: same origin, so the sign-in cookie
// goes along; JSON protocol; no automatic reconnect (connection.ts decides when).
// Its own module so page tests can swap it for a fake (vi.mock).
import { HubConnectionBuilder, LogLevel, type HubConnection } from '@microsoft/signalr'
import { TABLE_HUB_PATH } from './hub'

export function createTableConnection(): HubConnection {
  return new HubConnectionBuilder()
    .withUrl(TABLE_HUB_PATH)
    .configureLogging(LogLevel.Warning)
    .build()
}
