import { useSeoMeta, useHead, type UseSeoMetaInput } from '@unhead/react'
import { type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useI18n } from './i18n'

const SITE_NAME = 'ViDrive'
const SITE_URL = 'https://vidrive.app'
const DEFAULT_DESCRIPTION =
  'Vietnam\'s first-of-its-kind car total cost of ownership (TCO) calculator. ' +
  'Compare EVs, hybrids, and ICE vehicles across Vietnamese cities. ' +
  'Estimate depreciation, fuel, maintenance, registration, and financing.'

export interface SeoMetaInput extends UseSeoMetaInput {
  canonical?: string
  noindex?: boolean
  ogImage?: string
  ogImageAlt?: string
}

/**
 * Hook to set per-route SEO meta tags. Call at the top level of any page component.
 *
 * Uses the i18n `t` function to resolve title/description from `page.*` keys,
 * falling back to sensible defaults. Also injects Open Graph and canonical tags.
 */
export function useSeoMetaSafe(meta: SeoMetaInput): void {
  const { t, locale } = useI18n()
  const location = useLocation()

  const resolvedTitle = t('page.title')
  const resolvedDesc = t('page.description')
  // t() returns the key itself when missing, so detect that and fall back
  const title = meta.title ?? (resolvedTitle === 'page.title' ? SITE_NAME : resolvedTitle)
  const description =
    meta.description ?? (resolvedDesc === 'page.description' ? DEFAULT_DESCRIPTION : resolvedDesc)
  const canonicalPath = meta.canonical ?? location.pathname

  // @ts-expect-error -- useSeoMeta accepts a broad input; we normalize here
  useSeoMeta({
    title: String(title),
    description: String(description),
    ogTitle: String(title),
    ogDescription: String(description),
    ogSiteName: SITE_NAME,
    ogUrl: `${SITE_URL}${canonicalPath}`,
    ogLocale: locale === 'vi' ? 'vi_VN' : 'en_US',
    twitterCard: 'summary_large_image',
    canonical: `${SITE_URL}${canonicalPath}`,
    ...(meta.ogImage ? { ogImage: meta.ogImage, twitterImage: meta.ogImage } : {}),
    ...(meta.ogImageAlt ? { ogImageAlt: meta.ogImageAlt } : {}),
    ...(meta.noindex ? { robots: 'noindex,nofollow' } : {}),
  })
}

/**
 * Render a JSON-LD <script type="application/ld+json"> block via useHead.
 * Pass already-serialized JSON. Safe for CSR — unhead injects it into <head>.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }): ReactNode {
  useHead({
    script: [
      {
        type: 'application/ld+json',
        children: JSON.stringify(data),
      },
    ],
  })
  return null
}

/**
 * Resolve a car name from a car object for use in meta tags / alt text.
 */
export function carDisplayName(car: { brand?: string; model?: string; id?: string }): string {
  if (car.brand && car.model) return `${car.brand} ${car.model}`
  if (car.id) return car.id.replace(/_/g, ' ')
  return SITE_NAME
}

export { SITE_URL, SITE_NAME, DEFAULT_DESCRIPTION }

/**
 * Build a schema.org BreadcrumbList object for use with <JsonLd>.
 */
export interface BreadcrumbItem {
  name: string
  url: string
}

export function breadcrumbLd(items: BreadcrumbItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  }
}
