// The studio follows its requests over the image hub while one is queued or running, and
// disconnects as soon as none is left, since an open connection keeps the scale-to-zero
// server awake (knowledge/decisions/hosting.md). Events are never replayed, so every
// (re)connect asks for the studio again.
import type { HubConnection } from '@microsoft/signalr'
import { useEffect, useEffectEvent } from 'react'
import { invokeImageHub, onImageHubEvent } from '../editor/background/hub'
import { WATCH_RETRY_MS } from '../editor/background/watch'
import { createTokenImageConnection } from '../tokenImages/createConnection'

export function useSpellArtWatch(variantId: string, active: boolean, onChange: () => void) {
  const changed = useEffectEvent(onChange)
  useEffect(() => {
    if (!active) return
    let live = true
    let retry: ReturnType<typeof setTimeout> | undefined
    let connection: HubConnection | null = null
    let failures = 0
    let refused = false
    const again = () => {
      if (!live || refused) return
      clearTimeout(retry)
      retry = setTimeout(
        () => void connect(),
        WATCH_RETRY_MS[Math.min(failures++, WATCH_RETRY_MS.length - 1)],
      )
    }

    const connect = async () => {
      const current = createTokenImageConnection()
      connection = current
      onImageHubEvent(current, 'TokenImageUpdated', (image) => {
        if (live && image.ownerId === variantId) changed()
      })
      current.onclose(again)
      try {
        await current.start()
        if (!live) return void current.stop()
        const result = await invokeImageHub(current, 'WatchSpellArt', variantId)
        if (result.error) {
          refused = true
          return void current.stop()
        }
        failures = 0
        changed()
      } catch {
        again()
      }
    }
    void connect()
    return () => {
      live = false
      clearTimeout(retry)
      void connection?.stop().catch(() => {})
    }
  }, [active, variantId])
}
