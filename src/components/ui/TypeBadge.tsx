import {
  TrendingUp, TrendingDown, PiggyBank, CreditCard,
  Briefcase, ShoppingBag,
} from 'lucide-react'
import type { CategoryType } from '@/lib/database.types'

const CONFIG: Record<
  CategoryType,
  { label: string; bg: string; text: string; Icon: React.ElementType }
> = {
  INCOME:            { label: 'Entrata',        bg: 'bg-emerald-50',  text: 'text-emerald-700', Icon: TrendingUp   },
  EXPENSES:          { label: 'Spesa',           bg: 'bg-rose-50',     text: 'text-rose-700',    Icon: TrendingDown },
  SAVINGS:           { label: 'Risparmio',       bg: 'bg-amber-50',    text: 'text-amber-700',   Icon: PiggyBank    },
  DEBTS:             { label: 'Debito',          bg: 'bg-violet-50',   text: 'text-violet-700',  Icon: CreditCard   },
  BUSINESS_INCOME:   { label: 'Entrata biz.',    bg: 'bg-indigo-50',   text: 'text-indigo-700',  Icon: Briefcase    },
  BUSINESS_EXPENSES: { label: 'Spesa biz.',      bg: 'bg-slate-50',    text: 'text-slate-700',   Icon: ShoppingBag  },
}

export function TypeBadge({ type }: { type: CategoryType }) {
  const { label, bg, text, Icon } = CONFIG[type] ?? CONFIG.INCOME
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${bg} ${text}`}>
      <Icon size={10} strokeWidth={2} />
      {label}
    </span>
  )
}
