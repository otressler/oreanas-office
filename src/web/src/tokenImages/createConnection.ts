// The image hub connection for icon and portrait galleries, set up like the background
// panel's (editor/background/createConnection.ts): same origin, so the sign-in cookie goes
// along; JSON protocol; no automatic reconnect (watch.ts decides when). Its own module so
// tests can swap it for a fake (vi.mock) independently of the editor's.
import { HubConnectionBuilder, LogLevel, type HubConnection } from '@microsoft/signalr'
import { IMAGE_HUB_PATH } from '../editor/background/hub'

export function createTokenImageConnection(): HubConnection {
  return new HubConnectionBuilder()
    .withUrl(IMAGE_HUB_PATH)
    .configureLogging(LogLevel.Warning)
    .build()
}
