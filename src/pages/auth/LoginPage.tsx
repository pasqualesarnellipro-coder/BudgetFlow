import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  TrendingUp, Eye, EyeOff, ArrowRight,
  BarChart2, Target, RefreshCw, ShieldCheck,
} from 'lucide-react'

const FEATURES = [
  {
    icon: BarChart2,
    title: 'Dashboard completa',
    desc: 'Entrate, uscite, risparmi e debiti in un colpo d\'occhio. Grafici mensili e annuali.',
  },
  {
    icon: Target,
    title: 'Obiettivi di risparmio',
    desc: 'Crea obiettivi personalizzati — casa, vacanze, fondo emergenza — e traccia i progressi.',
  },
  {
    icon: RefreshCw,
    title: 'Import da banca',
    desc: 'Importa i movimenti da CSV/Excel di qualsiasi banca italiana con un click.',
  },
  {
    icon: ShieldCheck,
    title: 'Pianificazione fiscale',
    desc: 'RataPilota calcola automaticamente tasse, INPS e rata mensile per i freelance.',
  },
]

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    if (mode === 'reset') {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (err) setError(err.message)
      else setSuccess('Email inviata! Controlla la tua casella di posta.')
      setLoading(false)
      return
    }

    const { error: authError } = mode === 'signup'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      // Traduci errori comuni in italiano
      const msg = authError.message
      if (msg.includes('Invalid login credentials'))    setError('Email o password non corretti.')
      else if (msg.includes('Email not confirmed'))     setError('Conferma prima la tua email.')
      else if (msg.includes('User already registered')) setError('Questo indirizzo email è già registrato.')
      else if (msg.includes('Password should be'))      setError('La password deve essere di almeno 6 caratteri.')
      else setError(msg)
    } else if (mode === 'signup') {
      setSuccess('Account creato! Controlla la tua email per confermare l\'iscrizione.')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex">

      {/* ── LEFT — Branding ──────────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar flex-col justify-between p-10 relative overflow-hidden">
        {/* Cerchi decorativi */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full" />
        <div className="absolute -bottom-32 -left-16 w-72 h-72 bg-white/5 rounded-full" />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
            <TrendingUp size={20} className="text-white" />
          </div>
          <div>
            <span className="text-white font-bold text-xl tracking-tight">BudgetFlow</span>
            <p className="text-white/40 text-xs">Finanze personali & freelance</p>
          </div>
        </div>

        {/* Headline */}
        <div className="relative">
          <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">
            Prendi il controllo<br />delle tue finanze.
          </h1>
          <p className="text-white/60 text-base leading-relaxed mb-10">
            Dashboard, budget, obiettivi, abbonamenti e pianificazione fiscale — tutto in un posto solo.
          </p>

          {/* Feature list */}
          <div className="space-y-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={16} className="text-white/80" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{title}</p>
                  <p className="text-white/50 text-xs mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="relative text-white/30 text-xs">
          © {new Date().getFullYear()} BudgetFlow · Tutti i dati sono crittografati
        </p>
      </div>

      {/* ── RIGHT — Form ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-sm">

          {/* Logo mobile */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <TrendingUp size={16} className="text-white" />
            </div>
            <span className="font-bold text-gray-900">BudgetFlow</span>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">

            {/* Intestazione form */}
            <div className="mb-7">
              <h2 className="text-2xl font-bold text-gray-900">
                {mode === 'login'  && 'Bentornato 👋'}
                {mode === 'signup' && 'Crea il tuo account'}
                {mode === 'reset'  && 'Reimposta password'}
              </h2>
              <p className="text-gray-400 text-sm mt-1">
                {mode === 'login'  && 'Inserisci le tue credenziali per accedere'}
                {mode === 'signup' && 'Inizia gratis, nessuna carta richiesta'}
                {mode === 'reset'  && 'Ti invieremo un link via email'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="nome@email.com"
                  autoComplete="email"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-gray-50 transition-all"
                />
              </div>

              {/* Password */}
              {mode !== 'reset' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-gray-700">Password</label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => setMode('reset')}
                        className="text-xs text-indigo-500 hover:text-indigo-700"
                      >
                        Password dimenticata?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-gray-50 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {mode === 'signup' && (
                    <p className="text-xs text-gray-400 mt-1">Minimo 6 caratteri</p>
                  )}
                </div>
              )}

              {/* Errore */}
              {error && (
                <div className="bg-rose-50 border border-rose-100 rounded-xl px-3 py-2.5 text-xs text-rose-600 flex items-start gap-2">
                  <span className="mt-0.5">⚠️</span>
                  {error}
                </div>
              )}

              {/* Successo */}
              {success && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 text-xs text-emerald-700 flex items-start gap-2">
                  <span>✓</span>
                  {success}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <>
                    {mode === 'login'  && 'Accedi'}
                    {mode === 'signup' && 'Crea account'}
                    {mode === 'reset'  && 'Invia link reset'}
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>

            {/* Switch mode */}
            <div className="mt-6 text-center text-sm text-gray-400">
              {mode === 'login' && (
                <>
                  Non hai un account?{' '}
                  <button onClick={() => { setMode('signup'); setError(''); setSuccess('') }}
                    className="text-indigo-600 font-semibold hover:underline">
                    Registrati gratis
                  </button>
                </>
              )}
              {mode === 'signup' && (
                <>
                  Hai già un account?{' '}
                  <button onClick={() => { setMode('login'); setError(''); setSuccess('') }}
                    className="text-indigo-600 font-semibold hover:underline">
                    Accedi
                  </button>
                </>
              )}
              {mode === 'reset' && (
                <button onClick={() => { setMode('login'); setError(''); setSuccess('') }}
                  className="text-indigo-600 font-semibold hover:underline">
                  ← Torna al login
                </button>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-5">
            I tuoi dati sono al sicuro e non vengono condivisi con terze parti.
          </p>
        </div>
      </div>
    </div>
  )
}
