import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu, TrendingUp } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { useAppStore } from '@/store/useAppStore'
import { OnboardingBanner } from '@/components/ui/OnboardingBanner'

// ── Titoli per ogni route ─────────────────────────────────────────────────────
const ROUTE_TITLES: Record<string, string> = {
  '/':              'Dashboard Annuale',
  '/monthly':       'Dashboard Mensile',
  '/transactions':  'Transazioni',
  '/accounts':      'Conti',
  '/budget':        'Budget Annuale',
  '/goals':         'Obiettivi',
  '/bills':         'Abbonamenti',
  '/categories':    'Categorie',
  '/freelance':     'Freelance Hub',
  '/settings':      'Impostazioni',
  '/welcome':       'Guida iniziale',
  '/profile-setup': 'Modifica profilo',
}

export function AppLayout() {
  const profile = useAppStore((s) => s.profile)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()

  // ── Titolo tab dinamico ──────────────────────────────────────────────────────
  useEffect(() => {
    const pageTitle = ROUTE_TITLES[pathname]
    document.title = pageTitle ? `${pageTitle} | BudgetFlow` : 'BudgetFlow'
  }, [pathname])

  if (!profile) return null

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        profileType={profile.profile_type}
        username={profile.name}
        currency={profile.currency}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 flex flex-col min-w-0">
        {/* Header mobile — landmark <header> per screen reader */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 sticky top-0 z-10 shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Apri menu di navigazione"
            aria-expanded={sidebarOpen}
            aria-controls="sidebar-nav"
            className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-indigo-500 rounded-md flex items-center justify-center" aria-hidden="true">
              <TrendingUp size={12} className="text-white" />
            </div>
            <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">BudgetFlow</span>
          </div>
        </header>

        <div className="flex-1">
          <Outlet />
        </div>
        <OnboardingBanner />
      </main>
    </div>
  )
}
