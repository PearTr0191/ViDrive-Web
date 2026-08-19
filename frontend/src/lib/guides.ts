// Local copy of the i18n `Locale` union. Kept here (instead of importing from
// `./i18n`, which transitively pulls in DOM/browser code) so this module can be
// safely imported from `vite.config.ts` under the node tsconfig (no DOM lib).
export type Locale = 'en' | 'vi'

export type GuideSlug =
  | 'phi-truoc-ba'
  | 'xe-dien-hay-xang'
  | 'mua-xe-tra-gop'
  | 'xe-giu-gia'
  | 'chi-phi-hang-thang'
  | 'cach-tinh-tco'
  | 'vinfast-giu-gia'
  | 'chon-xe'

export interface GuideDef {
  slug: GuideSlug
  /** Destination route for the article's call-to-action */
  ctaRoute: string
  /** i18n source keys for isBasedOn citation in Article JSON-LD.
   *  Resolved at runtime via the `t` function — empty array when the guide
   *  has no specific external source and falls back to /methodology. */
  sourceKeys: string[]
}

export const GUIDES: GuideDef[] = [
  { slug: 'phi-truoc-ba', ctaRoute: '/tco', sourceKeys: ['methodology.source.govRegistration'] },
  { slug: 'xe-dien-hay-xang', ctaRoute: '/compare', sourceKeys: ['methodology.source.fuelPricing'] },
  { slug: 'mua-xe-tra-gop', ctaRoute: '/tco', sourceKeys: ['methodology.source.govRegistration'] },
  { slug: 'xe-giu-gia', ctaRoute: '/car', sourceKeys: ['methodology.source.resale'] },
  { slug: 'chi-phi-hang-thang', ctaRoute: '/tco', sourceKeys: ['methodology.source.resale'] },
  { slug: 'cach-tinh-tco', ctaRoute: '/tco', sourceKeys: [
    'methodology.source.fuelPricing',
    'methodology.source.govRegistration',
    'methodology.source.insurance',
    'methodology.source.resale',
  ] },
  { slug: 'vinfast-giu-gia', ctaRoute: '/compare', sourceKeys: ['methodology.source.resale'] },
  { slug: 'chon-xe', ctaRoute: '/car', sourceKeys: [] },
]

export const GUIDE_SLUGS: GuideSlug[] = GUIDES.map(g => g.slug)

/** True if a slug string is a valid guide. Uses a Set for O(1) lookup. */
const GUIDE_SLUG_SET: ReadonlySet<string> = new Set(GUIDE_SLUGS)
export function isValidGuideSlug(slug: string | undefined): slug is GuideSlug {
  return typeof slug === 'string' && GUIDE_SLUG_SET.has(slug)
}

export function getGuide(slug: GuideSlug): GuideDef {
  return GUIDES.find(g => g.slug === slug) as GuideDef
}

export function guideI18nKey(slug: GuideSlug, part: 'title' | 'body0' | 'body1' | 'body2' | 'cta'): string {
  return `guides.${slug}.${part}`
}

export function guideSources(slug: GuideSlug, t: (key: string) => string): Array<{ name: string; url: string }> {
  const def = getGuide(slug)
  const sources = def.sourceKeys.length > 0
    ? def.sourceKeys
    : ['methodology.source.manufacturerData']
  return sources.map(key => ({ name: key, url: t(key) }))
}

/** Locale string for the Article JSON-LD inLanguage field. */
export function localeString(locale: Locale): string {
  return locale === 'vi' ? 'vi_VN' : 'en_US'
}
