import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, ArrowLeftRight, PieChart,
  Target, RefreshCw, Tags, Briefcase, Settings, TrendingUp, Compass, Wallet,
} from 'lucide-react'
import type { ProfileType } from '@/lib/database.types'

interface Props {
  profileType: ProfileType
  username: string
  currency: string
}

const navItems = [
  { to: '/',             icon: LayoutDashboard, label: 'Dashboard Annuale' },
  { to: '/monthly',      icon: CalendarDays,    label: 'Dashboard Mensile' },
  { to: '/accounts',     icon: Wallet,          label: 'Conti' },
  { to: '/transactions', icon: ArrowLeftRight,  label: 'Transazioni' },
  { to: '/budget',       icon: PieChart,        label: 'Budget Annuale' },
  { to: '/goals',        icon: Target,          label: 'Obiettivi' },
  { to: '/bills',        icon: RefreshCw,       label: 'Abbonamenti' },
  { to: '/categories',   icon: Tags,            label: 'Categorie' },
]

const activeClass  = 'bg-white/12 text-white font-medium'
const defaultClass = 'text-white/55 hover:text-white hover:bg-white/8'

export function Sidebar({ profileType, username, currency }: Props) {
  const showFreelance = profileType === 'FREELANCE' || profileType === 'BOTH'

  return (
    <aside className="w-60 h-screen bg-sidebar flex flex-col shrink-0 overflow-hidden">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/8 shrink-0">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center">
            <TrendingUp size={14} className="text-white" />
          </div>
          <span className="text-white font-bold text-base tracking-tight">BudgetFlow</span>
        </div>
        <p className="text-white/35 text-xs pl-0.5">{username} · {currency}</p>
      </div>

      {/* Nav principale — scrollabile */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 scrollbar-none">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                isActive ? activeClass : defaultClass
              }`
            }
          >
            <Icon size={15} strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}

        {showFreelance && (
          <>
            <div className="px-3 pt-3 pb-1">
              <p className="text-white/25 text-[10px] uppercase tracking-widest font-semibold">Freelance</p>
            </div>
            <NavLink
              to="/freelance"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  isActive
                    ? 'bg-indigo-500/25 text-indigo-200 font-medium'
                    : 'text-indigo-300/60 hover:text-indigo-200 hover:bg-indigo-500/15'
                }`
              }
            >
              <Briefcase size={15} strokeWidth={1.8} />
              Freelance Hub
            </NavLink>
          </>
        )}
      </nav>

      {/* Footer — FISSO in basso, non scrolla mai */}
      <div className="shrink-0 px-3 pb-4 pt-3 border-t border-white/8 space-y-0.5">
        <NavLink
          to="/welcome"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
              isActive
                ? 'bg-amber-500/20 text-amber-300 font-medium'
                : 'text-amber-400/60 hover:text-amber-300 hover:bg-amber-500/10'
            }`
          }
        >
          <Compass size={15} strokeWidth={1.8} />
          Guida iniziale
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
              isActive ? activeClass : defaultClass
            }`
          }
        >
          <Settings size={15} strokeWidth={1.8} />
          Impostazioni
        </NavLink>
      </div>
    </aside>
  )
}
