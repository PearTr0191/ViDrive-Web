import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type RouteObject, type LoaderFunctionArgs } from 'react-router-dom'
import type { ReactNode } from 'react'
import { I18nProvider } from './lib/i18n'
import { ThemeProvider } from './lib/theme'
import { api } from './lib/api'
import type { CarInfo } from './lib/api'
import RootApp from './App'
import Landing from './pages/Landing'
import TcoCalculator from './pages/TcoCalculator'
import Compare from './pages/Compare'
import Wizard from './pages/Wizard'
import History from './pages/History'
import BrowseCars from './pages/BrowseCars'
import CarDetail from './pages/CarDetail'
import Methodology from './pages/Methodology'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Guides from './pages/Guides'
import GuidePage from './pages/GuidePage'
import NotFound from './pages/NotFound'

import carsDataRaw from '../../backend/data/cars.json'

function carsFromData(): CarInfo[] {
  return Object.entries(carsDataRaw as Record<string, any>).map(([id, car]) => ({
    id,
    ...car,
  })) as CarInfo[]
}

let _staticCache: CarInfo[] | null = null
function getStaticCars(): CarInfo[] {
  if (_staticCache) return _staticCache
  _staticCache = carsFromData()
  return _staticCache
}

export const ssgQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
})

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={ssgQueryClient}>
        <I18nProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </I18nProvider>
    </QueryClientProvider>
  )
}

// Cache-aware loaders: on client-side navigation the SSG-baked data (and the
// react-query cache populated on first mount) is already present, so we must
// NOT re-run the network fetch — react-router blocks painting the destination
// route until the loader resolves, which made landing/browse feel slow vs
// loader-less routes. We only fetch when the cache is empty.
async function landingLoader() {
  let cars = ssgQueryClient.getQueryData<CarInfo[]>(['cars'])
  let config = ssgQueryClient.getQueryData(['config'])

  if (!cars) {
    try {
      cars = await api.getCars()
    } catch {
      cars = getStaticCars()
    }
    ssgQueryClient.setQueryData(['cars'], cars)
  }

  if (config === undefined) {
    try {
      config = await api.getConfig()
    } catch {
      config = null
    }
    ssgQueryClient.setQueryData(['config'], config)
  }

  return { cars, config }
}

async function browseLoader() {
  let cars = ssgQueryClient.getQueryData<CarInfo[]>(['cars'])

  if (!cars) {
    try {
      cars = await api.getCars()
    } catch {
      cars = getStaticCars()
    }
    ssgQueryClient.setQueryData(['cars'], cars)
  }

  return { cars }
}

async function carLoader({ params }: LoaderFunctionArgs) {
  const { id } = params
  if (!id) throw new Response('Car ID not found', { status: 404 })

  if (id.startsWith('custom-')) {
    throw new Response('Custom car not found', { status: 404 })
  }

  let car: CarInfo | null = null

  try {
    car = await api.getCar(id)
  } catch {
    car = getStaticCars().find(c => c.id === id) ?? null
  }

  if (!car) throw new Response(`Car ${id} not found`, { status: 404 })

  ssgQueryClient.setQueryData(['car', id], car)

  return { car }
}

export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <RootProviders>
        <RootApp />
      </RootProviders>
    ),
    children: [
      { index: true, element: <Landing />, loader: landingLoader },
      { path: 'tco', element: <TcoCalculator /> },
      { path: 'compare', element: <Compare /> },
      { path: 'wizard', element: <Wizard /> },
      { path: 'car', element: <BrowseCars />, loader: browseLoader },
      { path: 'car/:id', element: <CarDetail />, loader: carLoader },
      { path: 'history', element: <History /> },
      { path: 'methodology', element: <Methodology /> },
      { path: 'terms', element: <Terms /> },
      { path: 'privacy', element: <Privacy /> },
      { path: 'guides', element: <Guides /> },
      { path: 'guides/:slug', element: <GuidePage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]
