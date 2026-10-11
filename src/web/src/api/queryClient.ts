import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { ApiRequestError } from './errors'

/** Query key of the signed-in user: `Me`, or null when signed out. */
export const meQueryKey = ['me'] as const

export function createQueryClient(): QueryClient {
  // A 401 anywhere means the sign-in has ended (e.g. the cookie expired), so the
  // app forgets the user and the auth guard sends them to the sign-in page.
  const onError = (error: unknown) => {
    if (error instanceof ApiRequestError && error.status === 401) {
      client.setQueryData(meQueryKey, null)
    }
  }
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        // A 4xx won't change by asking again; network errors and 5xx might.
        retry: (failures, error) =>
          !(error instanceof ApiRequestError && error.status < 500) && failures < 2,
      },
    },
  })
  return client
}
