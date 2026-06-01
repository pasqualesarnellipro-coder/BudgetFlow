import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { LoginPage } from '@/pages/auth/LoginPage'
import { OnboardingPage } from '@/pages/auth/OnboardingPage'
import { AppLayout } from '@/components/layout/AppLayout'
import { AnnualDashboard } from '@/pages/AnnualDashboard'
import { MonthlyDashboard } from '@/pages/MonthlyDashboard'
import { TransactionsPage } from '@/pages/TransactionsPage'
import { AnnualBudgetPage } from '@/pages/AnnualBudgetPage'
import { GoalsPage } from '@/pages/GoalsPage'
import { BillsPage } from '@/pages/BillsPage'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { FreelanceHub } from '@/pages/FreelanceHub'
import { AccountsPage } from '@/pages/AccountsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { WelcomePage } from '@/pages/WelcomePage'
import { FICCallbackPage } from '@/pages/auth/FICCallbackPage'
import './index.css'

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 1000 * 60 } } })

function AuthGate() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const { profile, setProfile, darkMode } = useAppStore()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session) setProfile(null)
    })
    return () => sub.subscription.unsubscribe()
  }, [setProfile])

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => {
      if (data) setProfile(data)
    })
  }, [user, setProfile])

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
          <Route path="/" element={<AnnualDashboard />} />
          <Route path="/monthly" element={<MonthlyDashboard />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/budget" element={<AnnualBudgetPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/bills" element={<BillsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/freelance" element={<FreelanceHub />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile-setup" element={<OnboardingPage userId={user!.id} editMode />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/auth/fic-callback" element={<FICCallbackPage />} />
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
