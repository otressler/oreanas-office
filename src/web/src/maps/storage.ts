// Asks the browser to keep the offline maps (knowledge/decisions/offline-prep-pwa.md,
// "Per user and kept"): without it, a browser short on space may clear them before
// they are synced. Asked once per page load, when a map is created or imported, and
// never awaited: a refusal or a missing API only means the browser decides itself.

let asked = false

export function keepStorage(storage: StorageManager | undefined = navigator.storage): void {
  if (asked || typeof storage?.persist !== 'function') return
  asked = true
  void (async () => {
    try {
      if (await storage.persisted?.()) return
      await storage.persist()
    } catch {
      // Some browsers throw in private windows; the maps are still saved.
    }
  })()
}

/** For tests: forget that the browser was asked. */
export function forgetStorageRequest(): void {
  asked = false
}
