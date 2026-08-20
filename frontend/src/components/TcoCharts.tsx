import { memo } from 'react'
import { useI18n } from '../lib/i18n'
import { formatVND, type TcoResponse } from '../lib'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend } from 'recharts'
import GlassCard from './ui/GlassCard'
import Skeleton from './ui/Skeleton'

const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)']

type LineRow = { year: string; resale: number; operating: number; cumulative: number; guarantee?: number | null }
type PieRow = { name: string; value: number }

function TcoCharts({
  pieData,
  lineData,
  displayedYears,
  result,
  yearlyLoading,
}: {
  pieData: PieRow[]
  lineData: LineRow[]
  displayedYears: number
  result: TcoResponse | undefined
  yearlyLoading: boolean
}) {
  const { t } = useI18n()
  return (
    <GlassCard className="p-6">
      <h3 className="text-lg font-heading font-semibold text-[var(--text-primary)] mb-4">{t('tco.charts')}</h3>
      <div className="grid md:grid-cols-2 gap-6">
        {/* Pie chart - cost composition */}
        <div>
          <h4 className="text-sm text-accent mb-3">{t('tco.costComposition')}</h4>
          <div role="img" aria-label={t('tco.costComposition')}>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="var(--chart-1)"
                  dataKey="value"
                  isAnimationActive={false}
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) => formatVND(value)}
                  contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid rgba(var(--accent-rgb), 0.2)', borderRadius: '8px', color: 'var(--text-primary)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <table className="sr-only">
            <caption>{t('tco.costComposition')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('compare.metric')}</th>
                <th scope="col">{t('compare.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {pieData.map((row, i) => (
                <tr key={i}>
                  <th scope="row">{row.name}</th>
                  <td>{formatVND(row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Line chart - operating costs vs car value retention (two-line comparison) */}
        <div>
          <h4 className="text-sm text-accent mb-3">{t('tco.cumulativeCost')}</h4>
          <div role="img" aria-label={`${t('tco.cumulativeCost')} over ${displayedYears} years`}>
            {yearlyLoading && lineData.length === 0 ? (
              <div className="relative h-[250px] w-full">
                <Skeleton className="h-[250px] w-full" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                  <XAxis dataKey="year" stroke="var(--text-secondary)" fontSize={12} />
                  <YAxis stroke="var(--text-secondary)" fontSize={12} tickFormatter={(v) => {
                    if (!v) return ''
                    return v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : `${Math.round(v / 1e6)}M`
                  }} />
                  <Tooltip
                    formatter={(value, name) => [formatVND(Number(value ?? 0)), String(name ?? '')]}
                    contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid rgba(var(--accent-rgb), 0.2)', borderRadius: '8px', color: 'var(--text-primary)' }}
                  />
                  <Legend wrapperStyle={{ color: 'var(--text-secondary)', fontSize: 12, paddingTop: 8 }} />
                  <Line
                    type="monotone"
                    dataKey="resale"
                    name={t('tco.carValueRetention')}
                    stroke="var(--accent)"
                    strokeWidth={2}
                    dot={{ r: 4, fill: 'var(--accent)' }}
                    activeDot={{ r: 6 }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="operating"
                    name={t('tco.operatingCumulative')}
                    stroke="var(--chart-operating)"
                    strokeWidth={2}
                    dot={{ r: 4, fill: 'var(--chart-operating)' }}
                    activeDot={{ r: 6 }}
                    isAnimationActive={false}
                  />
                  {result?.result.resale_guarantee_floor != null && lineData.some((row) => row.guarantee != null) && (
                    <Line type="monotone" dataKey="guarantee" name={t('tco.guaranteeFloor')} stroke="var(--chart-guarantee)" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, fill: 'var(--chart-guarantee)' }} activeDot={{ r: 5 }} isAnimationActive={false} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <table className="sr-only">
            <caption>{t('tco.cumulativeCost')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('tco.years')}</th>
                <th scope="col">{t('tco.carValueRetention')}</th>
                <th scope="col">{t('tco.operatingCumulative')}</th>
                {result?.result.resale_guarantee_floor != null && (<th scope="col">{t('tco.guaranteeFloor')}</th>)}
              </tr>
            </thead>
            <tbody>
              {lineData.map((row, i) => (
                <tr key={i}>
                  <th scope="row">{row.year}</th>
                  <td>{formatVND(row.resale)}</td>
                  <td>{formatVND(row.operating)}</td>
                  {result?.result.resale_guarantee_floor != null && (<td>{row.guarantee != null ? formatVND(row.guarantee) : '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </GlassCard>
  )
}

export default memo(TcoCharts)
