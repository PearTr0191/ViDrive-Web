import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { UnheadProvider } from '@unhead/react/client'
import { routes, ssgQueryClient } from './routes'
import './index.css'
import { initA11yConsole } from './lib/a11y'

const router = createBrowserRouter(routes)

hydrateRoot(
  document.getElementById('app')!,
  <StrictMode>
    <QueryClientProvider client={ssgQueryClient}>
      <UnheadProvider>
        <RouterProvider router={router} />
      </UnheadProvider>
    </QueryClientProvider>
  </StrictMode>,
)

if (import.meta.env.DEV) {
  initA11yConsole()
}
