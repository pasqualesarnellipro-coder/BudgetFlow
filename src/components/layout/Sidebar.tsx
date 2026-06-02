import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, ArrowLeftRight, PieChart,
  Target, RefreshCw, Tags, Briefcase, Settings, TrendingUp,
  Compass, Wallet, X, Moon, Sun, LogOut, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { supabase } from '@/lib/supabase'
import type { ProfileType } from '@/lib/database.types'

interface Props {
  profileType: ProfileType
  username: string
  currency: string
  isOpen?: boolean
  onClose?: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
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

export function Sidebar({ profileType, username, currency, isOpen = false, onClose, collapsed = false, onToggleCollapse }: Props) {
  const showFreelance = profileType === 'FREELANCE' || profileType === 'BOTH'
  const { darkMode, toggleDarkMode } = useAppStore()

  const w = collapsed ? 'md:w-14' : 'md:w-60'

  return (
    <aside
      id="sidebar-nav"
      aria-label="Navigazione principale"
      className={`${w} w-60 h-screen bg-sidebar flex flex-col shrink-0 overflow-hidden fixed md:relative z-30 md:z-auto transition-all duration-300 ${
        isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}
    >
      {/* Logo */}
      <div className={`border-b border-white/8 shrink-0 ${collapsed ? 'px-0 py-4 flex justify-center' : 'px-5 py-5'}`}>
        {collapsed ? (
          <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center">
            <TrendingUp size={14} className="text-white" />
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-indigo-500 rounded-lg flex items-center justify-center">
                  <TrendingUp size={14} className="text-white" />
                </div>
                <span className="text-white font-bold text-base tracking-tight">BudgetFlow</span>
              </div>
              <button onClick={onClose} className="md:hidden text-white/40 hover:text-white p-1 transition-colors">
                <X size={16} />
              </button>
            </div>
            <p className="text-white/35 text-xs pl-0.5">{username} · {currency}</p>
          </div>
        )}
      </div>

      {/* Nav principale */}
      <nav className={`flex-1 overflow-y-auto py-3 space-y-0.5 scrollbar-none ${collapsed ? 'px-1' : 'px-3'}`}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center rounded-xl text-sm transition-all ${
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
              } ${isActive ? activeClass : defaultClass}`
            }
          >
            <Icon size={15} strokeWidth={1.8} />
            {!collapsed && label}
          </NavLink>
        ))}

        {showFreelance && (
          <>
            {!collapsed && (
              <div className="px-3 pt-3 pb-1">
                <p className="text-white/25 text-[10px] uppercase tracking-widest font-semibold">Freelance</p>
              </div>
            )}
            {collapsed && <div className="border-t border-white/8 my-2 mx-1" />}
            <NavLink
              to="/freelance"
              title={collapsed ? 'Freelance Hub' : undefined}
              className={({ isActive }) =>
                `flex items-center rounded-xl text-sm transition-all ${
                  collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
                } ${
                  isActive
                    ? 'bg-indigo-500/25 text-indigo-200 font-medium'
                    : 'text-indigo-300/60 hover:text-indigo-200 hover:bg-indigo-500/15'
                }`
              }
            >
              <Briefcase size={15} strokeWidth={1.8} />
              {!collapsed && 'Freelance Hub'}
            </NavLink>
          </>
        )}
      </nav>

      {/* Footer */}
      <div className={`shrink-0 pb-4 pt-3 border-t border-white/8 space-y-0.5 ${collapsed ? 'px-1' : 'px-3'}`}>
        {/* Dark mode */}
        <button
          onClick={toggleDarkMode}
          title={collapsed ? (darkMode ? 'Modalità chiara' : 'Modalità scura') : undefined}
          className={`w-full flex items-center rounded-xl text-sm transition-all ${
            collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
          } ${defaultClass}`}
        >
          {darkMode ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
          {!collapsed && (darkMode ? 'Modalità chiara' : 'Modalità scura')}
        </button>

        {/* Guida iniziale */}
        <NavLink
          to="/welcome"
          title={collapsed ? 'Guida iniziale' : undefined}
          className={({ isActive }) =>
            `flex items-center rounded-xl text-sm transition-all ${
              collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
            } ${isActive ? 'bg-amber-500/20 text-amber-300 font-medium' : 'text-amber-400/60 hover:text-amber-300 hover:bg-amber-500/10'}`
          }
        >
          <Compass size={15} strokeWidth={1.8} />
          {!collapsed && 'Guida iniziale'}
        </NavLink>

        {/* Impostazioni */}
        <NavLink
          to="/settings"
          title={collapsed ? 'Impostazioni' : undefined}
          className={({ isActive }) =>
            `flex items-center rounded-xl text-sm transition-all ${
              collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
            } ${isActive ? activeClass : defaultClass}`
          }
        >
          <Settings size={15} strokeWidth={1.8} />
          {!collapsed && 'Impostazioni'}
        </NavLink>

        {/* Logout */}
        <button
          onClick={() => supabase.auth.signOut()}
          title={collapsed ? 'Esci' : undefined}
          className={`w-full flex items-center rounded-xl text-sm transition-all text-rose-400/70 hover:text-rose-300 hover:bg-rose-500/10 ${
            collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
          }`}
        >
          <LogOut size={15} strokeWidth={1.8} />
          {!collapsed && 'Esci'}
        </button>

        {/* Toggle collapse — solo desktop */}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Espandi menu' : 'Comprimi menu'}
          className={`hidden md:flex w-full items-center rounded-xl text-sm transition-all ${
            collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2'
          } text-white/20 hover:text-white/50 hover:bg-white/5`}
        >
          {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /><span className="text-xs">Comprimi</span></>}
        </button>
      </div>
    </aside>
  )
}
