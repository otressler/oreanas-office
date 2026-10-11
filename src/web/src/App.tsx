import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { createQueryClient } from './api/queryClient'
import { router } from './router'

const queryClient = createQueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
