/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

// The Impressum's details, baked in at build time (imprintDefines in vite.config.ts).
interface ImportMetaEnv {
  readonly VITE_IMPRINT_NAME?: string
  readonly VITE_IMPRINT_STREET?: string
  readonly VITE_IMPRINT_CITY?: string
  readonly VITE_IMPRINT_EMAIL?: string
}
