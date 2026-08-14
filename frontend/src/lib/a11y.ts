interface A11yNode {
  target: string[]
  html: string
  failureSummary?: string
}

interface A11yViolation {
  id: string
  impact: 'minor' | 'moderate' | 'serious' | 'critical'
  description: string
  help: string
  helpUrl: string
  nodes: A11yNode[]
}

export interface A11yReport {
  violations: A11yViolation[]
  passes: number
  incomplete: number
  inapplicable: number
  timestamp: number
}

const RULES_TO_INCLUDE: string[] = [
  'wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa',
]

const RULES_TO_IGNORE: string[] = [
  'region',
]

function flattenTarget(target: unknown): string[] {
  if (Array.isArray(target)) {
    return target.map(sel => Array.isArray(sel) ? sel.join(' ') : String(sel))
  }
  return [String(target)]
}

export async function runA11yAudit(): Promise<A11yReport> {
  if (typeof window === 'undefined') {
    return { violations: [], passes: 0, incomplete: 0, inapplicable: 0, timestamp: Date.now() }
  }

  const axe = await import('axe-core')
  const result = (await axe.default.run(document, {
    runOnly: { type: 'tag', values: RULES_TO_INCLUDE },
    rules: Object.fromEntries(RULES_TO_IGNORE.map(r => [r, { enabled: false }])),
    reporter: 'v2',
  })) as {
    violations: Array<{
      id: string
      impact?: string | null
      description: string
      help: string
      helpUrl: string
      nodes: Array<{ target: unknown; html: string; failureSummary?: string }>
    }>
    passes: unknown[]
    incomplete: unknown[]
    inapplicable: unknown[]
  }

  return {
    violations: result.violations.map(v => ({
      id: v.id,
      impact: (v.impact || 'moderate') as A11yViolation['impact'],
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.map(n => ({
        target: flattenTarget(n.target),
        html: n.html,
        failureSummary: n.failureSummary || '',
      })),
    })),
    passes: result.passes.length,
    incomplete: result.incomplete.length,
    inapplicable: result.inapplicable.length,
    timestamp: Date.now(),
  }
}

export function logA11yReport(report: A11yReport): void {
  const { violations, passes, incomplete, inapplicable } = report

  console.group(`[a11y] axe-core audit — ${new Date(report.timestamp).toLocaleTimeString()}`)
  console.log(`Passes: ${passes} | Incomplete: ${incomplete} | Inapplicable: ${inapplicable}`)

  if (violations.length === 0) {
    console.log('%c✓ No WCAG violations found', 'color:#00c853;font-weight:bold')
    console.groupEnd()
    return
  }

  console.warn(`%c✗ ${violations.length} violation(s) found`, 'color:#dc2626;font-weight:bold')

  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  violations.forEach(v => { byImpact[v.impact]++ })

  console.table(byImpact)

  violations.forEach(v => {
    console.group(`[${v.impact.toUpperCase()}] ${v.id}: ${v.description}`)
    console.log(`Help: ${v.help}`)
    console.log(`URL: ${v.helpUrl}`)
    v.nodes.forEach((n, i) => {
      console.log(`Node ${i + 1}:`, n.target.join(' > '))
      if (n.failureSummary) console.log('  Summary:', n.failureSummary)
    })
    console.groupEnd()
  })

  console.groupEnd()
}

export function a11ySummary(report: A11yReport): string {
  if (report.violations.length === 0) return '✓ No WCAG violations found'

  const byImpact: Record<string, number> = {}
  report.violations.forEach(v => { byImpact[v.impact] = (byImpact[v.impact] || 0) + 1 })
  const parts = Object.entries(byImpact).map(([impact, count]) => `${count} ${impact}`)
  return `✗ ${report.violations.length} violation(s): ${parts.join(', ')}`
}

declare global {
  interface Window {
    __vidriveA11y?: {
      run: () => Promise<A11yReport>
      log: () => Promise<A11yReport>
      summary: () => Promise<string>
    }
  }
}

export function initA11yConsole(): void {
  if (typeof window === 'undefined' || window.__vidriveA11y) return

  window.__vidriveA11y = {
    run: async () => {
      const report = await runA11yAudit()
      return report
    },
    log: async () => {
      const report = await runA11yAudit()
      logA11yReport(report)
      return report
    },
    summary: async () => {
      const report = await runA11yAudit()
      const text = a11ySummary(report)
      console.log(`[a11y] ${text}`)
      return text
    },
  }

  console.log(
    '%c[a11y] axe-core loaded. Use %cwindow.__vidriveA11y.log() %cto run a full WCAG audit.',
    'font-weight:bold',
    'color:#00c853;font-weight:bold',
    'font-weight:normal',
  )
}
