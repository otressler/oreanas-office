// Test helpers: a stubbed fetch that answers API routes, and rendering the app's
// routes in memory with the server already awake.
import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { vi } from 'vitest'
import { createQueryClient } from '../api/queryClient'
import type { Me } from '../api/types'
import { routes } from '../routes'
import { useServerStatus, type ServerStatus } from '../server/serverStatus'

export interface ApiCall {
  method: string
  path: string
  search: string
  body: unknown
}

type Handler = (call: ApiCall) => Response | Promise<Response>

/** A JSON response; `json(401)` alone is an empty error. */
export function json(status: number, body?: unknown): Response {
  if (body === undefined) return new Response(null, { status })
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Stubs fetch with handlers keyed "METHOD /path" (path parameters as `:name`).
 * Unknown routes answer 404. Returns the calls made, for assertions.
 */
export function mockApi(handlers: Record<string, Handler | Response | (() => Response)>) {
  const calls: ApiCall[] = []
  const entries = Object.entries(handlers).map(([key, handler]) => {
    const [method, pattern] = key.split(' ') as [string, string]
    const regex = new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}$`)
    return { method, regex, handler }
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      const text = await request.text()
      const call: ApiCall = {
        method: request.method,
        path: url.pathname,
        search: url.search,
        body: text ? JSON.parse(text) : undefined,
      }
      calls.push(call)
      const match = entries.find((e) => e.method === call.method && e.regex.test(call.path))
      if (!match) return json(404)
      const { handler } = match
      // Responses can be read once, so a plain Response is cloned per call.
      return handler instanceof Response ? handler.clone() : handler(call)
    }),
  )
  return calls
}

export const testUser: Me = {
  id: '00000000-0000-0000-0000-000000000001',
  displayName: 'Mira',
  email: 'mira@example.org',
  isAdmin: false,
  hasPassword: true,
  hasGoogle: false,
}

/** Renders the app's routes at `path`, as if the server were awake unless `status` says otherwise. */
export function renderApp(path: string, { status = 'ready' }: { status?: ServerStatus } = {}) {
  useServerStatus.setState({ status })
  const queryClient = createQueryClient()
  queryClient.setDefaultOptions({ queries: { retry: false } })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, queryClient }
}
