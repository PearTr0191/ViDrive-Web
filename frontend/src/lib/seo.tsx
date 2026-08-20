import { useSeoMeta, useHead } from '@unhead/react'
import { type ReactNode } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { useI18n } from './i18n'

export type Locale = 'en' | 'vi'

const SITE_NAME = 'ViDrive'
const LOCALES: Locale[] = ['en', 'vi']
const DEFAULT_LOCALE: Locale = 'vi'
const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://vidrive-web.pages.dev'
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-tco.webp`
const DEFAULT_OG_IMAGE_ALT =
  'ViDrive — công cụ tính tổng chi phí sở hữu ô tô (TCO) minh bạch tại Việt Nam: so sánh xe điện, hybrid và xăng'
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
  ogType?: string
  [key: string]: unknown
}

export { SITE_URL, SITE_NAME, DEFAULT_DESCRIPTION, LOCALES, DEFAULT_LOCALE }

export function useCurrentLocale(): Locale {
  const { locale: paramLocale } = useParams() as { locale?: string }
  return (paramLocale ?? DEFAULT_LOCALE) as Locale
}

export function stripLocale(path: string): string {
  for (const loc of LOCALES) {
    const prefix = `/${loc}/`
    if (path === `/${loc}` || path.startsWith(prefix)) {
      return path === `/${loc}` ? '/' : path.slice(prefix.length - 1)
    }
  }
  return path
}

export function addLocale(locale: Locale, path: string): string {
  if (!path || path === '/') return `/${locale}`
  if (path.startsWith(`${SITE_URL}/`)) {
    const relative = path.slice(SITE_URL.length)
    return `/${locale}${relative}`
  }
  if (path.startsWith('/')) return `/${locale}${path}`
  return `/${locale}/${path}`
}

export function localeAlternates(canonicalPath: string): { en: string; vi: string; xDefault: string } {
  const stripped = stripLocale(canonicalPath)
  return {
    en: `${SITE_URL}${addLocale('en', stripped)}`,
    vi: `${SITE_URL}${addLocale('vi', stripped)}`,
    xDefault: `${SITE_URL}${stripped === '/' ? '/' : stripped}`,
  }
}

export function useLocalePath(path: string): string {
  const locale = useCurrentLocale()
  return addLocale(locale, path)
}

export function useSeoMetaSafe(meta: SeoMetaInput): void {
  const { t } = useI18n()
  const location = useLocation()

  const currentLocale = useCurrentLocale()
  const resolvedTitle = t('page.title')
  const resolvedDesc = t('page.description')
  const title = meta.title ?? (resolvedTitle === 'page.title' ? SITE_NAME : resolvedTitle)
  const description =
    meta.description ?? (resolvedDesc === 'page.description' ? DEFAULT_DESCRIPTION : resolvedDesc)
  const canonicalPath = meta.canonical ?? stripLocale(location.pathname)
  const canonicalUrl = `${SITE_URL}${canonicalPath === '/' ? '/' : canonicalPath}`
  const ogImage = meta.ogImage ?? DEFAULT_OG_IMAGE

  const alternates = localeAlternates(canonicalPath)

  useSeoMeta({
    title: String(title),
    description: String(description),
    ogTitle: String(title),
    ogDescription: String(description),
    ogSiteName: SITE_NAME,
    ogUrl: canonicalUrl,
    ogImage,
    ogImageAlt: meta.ogImageAlt ?? DEFAULT_OG_IMAGE_ALT,
    ogType: meta.ogType ?? 'website',
    ogLocale: currentLocale === 'vi' ? 'vi_VN' : 'en_US',
    twitterCard: 'summary_large_image',
    twitterTitle: String(title),
    twitterDescription: String(description),
    twitterImage: ogImage,
    ...(meta.noindex ? { robots: 'noindex,nofollow' } : {}),
  } as Record<string, unknown>)

  // Canonical + true hreflang alternates. Each locale gets its own URL
  // (/vi/path, /en/path) with x-default pointing to the locale-stripped canonical.
  useHead({
    link: [
      { rel: 'canonical', href: canonicalUrl },
      { rel: 'alternate', hreflang: 'en', href: alternates.en },
      { rel: 'alternate', hreflang: 'vi', href: alternates.vi },
      { rel: 'alternate', hreflang: 'x-default', href: alternates.xDefault },
    ],
  })
}

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

export function carDisplayName(car: { brand?: string; model?: string; id?: string }): string {
  if (car.brand && car.model) return `${car.brand} ${car.model}`
  if (car.id) return car.id.replace(/_/g, ' ')
  return SITE_NAME
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

export interface BreadcrumbItem {
  name: string
  url: string
}
