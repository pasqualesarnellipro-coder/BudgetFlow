import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { AppLayout } from '@/components/layout/AppLayout'
import './index.css'

// ── Lazy imports — ogni route è un chunk separato ─────────────────────────────
// Login/Onboarding NON sono lazy: servono subito prima che l'auth sia risolta.
import { LoginPage }     from '@/pages/auth/LoginPage'
import { OnboardingPage } from '@/pages/auth/OnboardingPage'

const AnnualDashboard  = lazy(() => import('@/pages/AnnualDashboard').then(m => ({ default: m.AnnualDashboard })))
const MonthlyDashboard = lazy(() => import('@/pages/MonthlyDashboard').then(m => ({ default: m.MonthlyDashboard })))
const TransactionsPage = lazy(() => import('@/pages/TransactionsPage').then(m => ({ default: m.TransactionsPage })))
const AccountsPage     = lazy(() => import('@/pages/AccountsPage').then(m => ({ default: m.AccountsPage })))
const AnnualBudgetPage = lazy(() => import('@/pages/AnnualBudgetPage').then(m => ({ default: m.AnnualBudgetPage })))
const GoalsPage        = lazy(() => import('@/pages/GoalsPage').then(m => ({ default: m.GoalsPage })))
const BillsPage        = lazy(() => import('@/pages/BillsPage').then(m => ({ default: m.BillsPage })))
const CategoriesPage   = lazy(() => import('@/pages/CategoriesPage').then(m => ({ default: m.CategoriesPage })))
const FreelanceHub     = lazy(() => import('@/pages/FreelanceHub').then(m => ({ default: m.FreelanceHub })))
const SettingsPage     = lazy(() => import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const WelcomePage      = lazy(() => import('@/pages/WelcomePage').then(m => ({ default: m.WelcomePage })))
const FICCallbackPage  = lazy(() => import('@/pages/auth/FICCallbackPage').then(m => ({ default: m.FICCallbackPage })))

// ── Fallback Suspense — mostrato mentre il chunk della route viene scaricato ──
function PageSkeleton() {
  return (
    <div className="p-5 space-y-4 max-w-5xl animate-pulse">
      {/* Header */}
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-xl w-48" />
      <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-lg w-32" />
      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
            <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-24" />
          </div>
        ))}
      </div>
      {/* Content */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 space-y-3">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700/50 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,        // 1 min — dati freschi per la navigazione normale
      gcTime: 1000 * 60 * 5,       // 5 min — cache in memoria dopo unmount
    },
  },
})

function AuthGate() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const { profile, setProfile, darkMode } = useAppStore()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  // ── Auth listener ──────────────────────────────────────────────────────────
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session) setProfile(null)
      setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [setProfile])

  // ── Profile fetch via React Query ──────────────────────────────────────────
  const { data: fetchedProfile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
      return data ?? null
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  })

  useEffect(() => {
    if (fetchedProfile) setProfile(fetchedProfile)
  }, [fetchedProfile, setProfile])

  if (loading) return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center">
      <div className="text-white text-sm">Caricamento...</div>
    </div>
  )

  if (!user) return <LoginPage />
  if (!profile || !profile.name) return <OnboardingPage userId={user.id} />

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/"                element={<Suspense fallback={<PageSkeleton />}><AnnualDashboard /></Suspense>} />
        <Route path="/monthly"         element={<Suspense fallback={<PageSkeleton />}><MonthlyDashboard /></Suspense>} />
        <Route path="/transactions"    element={<Suspense fallback={<PageSkeleton />}><TransactionsPage /></Suspense>} />
        <Route path="/accounts"        element={<Suspense fallback={<PageSkeleton />}><AccountsPage /></Suspense>} />
        <Route path="/budget"          element={<Suspense fallback={<PageSkeleton />}><AnnualBudgetPage /></Suspense>} />
        <Route path="/goals"           element={<Suspense fallback={<PageSkeleton />}><GoalsPage /></Suspense>} />
        <Route path="/bills"           element={<Suspense fallback={<PageSkeleton />}><BillsPage /></Suspense>} />
        <Route path="/categories"      element={<Suspense fallback={<PageSkeleton />}><CategoriesPage /></Suspense>} />
        <Route path="/freelance"       element={<Suspense fallback={<PageSkeleton />}><FreelanceHub /></Suspense>} />
        <Route path="/settings"        element={<Suspense fallback={<PageSkeleton />}><SettingsPage /></Suspense>} />
        <Route path="/profile-setup"   element={<Suspense fallback={<PageSkeleton />}><OnboardingPage userId={user!.id} editMode /></Suspense>} />
        <Route path="/welcome"         element={<Suspense fallback={<PageSkeleton />}><WelcomePage /></Suspense>} />
        <Route path="/auth/fic-callback" element={<Suspense fallback={<PageSkeleton />}><FICCallbackPage /></Suspense>} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={qc}>
        <AuthGate />
      </QueryClientProvider>
    </BrowserRouter>
  )
}
