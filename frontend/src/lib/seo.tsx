import { useSeoMeta, useHead } from '@unhead/react'
import { type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useI18n } from './i18n'

const SITE_NAME = 'ViDrive'
const SITE_URL = 'https://vidrive-web.pages.dev'
const DEFAULT_DESCRIPTION =
  'Tính chi phí sở hữu ô tô (TCO) tại Việt Nam: so sánh xe điện, hybrid và xăng, ' +
  'định giá xe cũ, ước tính lăn bánh, khấu hao, bảo dưỡng và tài chính. ' +
  'Minh bạch, tức thì. EV vs ICE vs hybrid TCO & used-car valuation calculator.'

export interface SeoMetaInput {
  title?: string
  description?: string
  canonical?: string
  noindex?: boolean
  ogImage?: string
  ogImageAlt?: string
  [key: string]: unknown
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
  const title = meta.title ?? (resolvedTitle === 'page.title' ? SITE_NAME : resolvedTitle)
  const description =
    meta.description ?? (resolvedDesc === 'page.description' ? DEFAULT_DESCRIPTION : resolvedDesc)
  const canonicalPath = meta.canonical ?? location.pathname
  const canonicalUrl = `${SITE_URL}${canonicalPath}`

  useSeoMeta({
    title: String(title),
    description: String(description),
    ogTitle: String(title),
    ogDescription: String(description),
    ogSiteName: SITE_NAME,
    ogUrl: canonicalUrl,
    ogLocale: locale === 'vi' ? 'vi_VN' : 'en_US',
    twitterCard: 'summary_large_image',
    ...(meta.ogImage ? { ogImage: meta.ogImage, twitterImage: meta.ogImage } : {}),
    ...(meta.ogImageAlt ? { ogImageAlt: meta.ogImageAlt } : {}),
    ...(meta.noindex ? { robots: 'noindex,nofollow' } : {}),
  } as Record<string, unknown>)

  useHead({
    link: [{ rel: 'canonical', href: canonicalUrl }],
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
        textContent: JSON.stringify(data),
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
