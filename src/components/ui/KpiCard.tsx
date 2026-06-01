import { DonutProgressRing } from './DonutProgressRing'
import { formatCurrency } from '@/lib/formatters'
import type { LucideIcon } from 'lucide-react'

interface Props {
  label: string
  amount: number
  budget: number
  color: string
  borderColor: string
  currency?: string
  Icon: LucideIcon
}

export function KpiCard({ label, amount, budget, color, borderColor, currency = 'EUR', Icon }: Props) {
  const pct = budget > 0 ? (amount / budget) * 100 : 0
  const delta = amount - budget
  const isOver = delta > 0

  return (
    <div
      className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-4"
      style={{ borderTop: `3px solid ${borderColor}` }}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: color + '18' }}
      >
        <Icon size={16} strokeWidth={2} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <p className="text-lg font-bold text-gray-900 truncate leading-tight">{formatCurrency(amount, currency)}</p>
        {budget > 0 && (
          <p className={`text-xs mt-0.5 font-medium ${isOver ? 'text-rose-500' : 'text-emerald-500'}`}>
            {isOver ? '+' : ''}{formatCurrency(delta, currency)} vs budget
          </p>
        )}
      </div>
      {budget > 0 && (
        <DonutProgressRing percentage={pct} color={color} size={52} strokeWidth={6} centerLabel={`${Math.round(pct)}%`} />
      )}
    </div>
  )
}
