// Typed client for the backend. The types come from the server's OpenAPI
// document (`npm run gen:api` writes schema.d.ts); never edit those by hand.
import createClient from 'openapi-fetch'
import type { paths } from './schema'

export const api = createClient<paths>({
  // Site and API share one origin (knowledge/decisions/frontend-stack.md). An
  // absolute base URL keeps `new Request()` working outside the browser too.
  baseUrl: globalThis.location?.origin ?? '',
  // Look fetch up on every call instead of capturing it once, so tests can stub it.
  fetch: (request) => globalThis.fetch(request),
  credentials: 'same-origin',
})
