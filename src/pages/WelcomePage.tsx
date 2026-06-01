import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import {
  Tags, PieChart, ArrowLeftRight, RefreshCw, Target,
  FileText, Lightbulb, BarChart2, Layers, ArrowRight,
  CheckCircle2, TrendingUp, Wallet, Trophy, UserCog,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Step {
  num: number
  Icon: LucideIcon
  iconColor: string
  iconBg: string
  borderColor: string
  doneColor: string        // colore bordo quando completato
  title: string
  desc: string
  action: string
  path: string
  time: string
  completionKey: string    // chiave per `completionMap`
}

// ── Definizione step ──────────────────────────────────────────────────────────

const STEPS_PERSONAL: Step[] = [
  {
    num: 1,
    Icon: Wallet,
    iconColor: '#4f46e5', iconBg: '#eef2ff', borderColor: '#a5b4fc', doneColor: '#6ee7b7',
    title: 'Aggiungi il tuo primo conto',
    desc: 'Collega il conto corrente, la carta o il portafoglio contanti. Serve per associare le transazioni — senza conto il salvataggio non funziona.',
    action: 'Vai ai Conti', path: '/accounts', time: '1 min',
    completionKey: 'accounts',
  },
  {
    num: 2,
    Icon: Tags,
    iconColor: '#059669', iconBg: '#ecfdf5', borderColor: '#6ee7b7', doneColor: '#6ee7b7',
    title: 'Controlla le categorie',
    desc: 'Abbiamo creato le categorie di default per te. Aggiungine di nuove, rinominale o disattiva quelle che non usi.',
    action: 'Vai alle Categorie', path: '/categories', time: '2 min',
    completionKey: 'categories',
  },
  {
    num: 3,
    Icon: PieChart,
    iconColor: '#e11d48', iconBg: '#fff1f2', borderColor: '#fda4af', doneColor: '#6ee7b7',
    title: 'Pianifica il budget mensile',
    desc: 'Inserisci quanto vuoi spendere per ogni categoria ogni mese. È la base di tutto il sistema di controllo.',
    action: 'Vai al Budget Annuale', path: '/budget', time: '5 min',
    completionKey: 'budget',
  },
  {
    num: 4,
    Icon: ArrowLeftRight,
    iconColor: '#d97706', iconBg: '#fffbeb', borderColor: '#fcd34d', doneColor: '#6ee7b7',
    title: 'Aggiungi le prime transazioni',
    desc: 'Registra entrate e uscite del mese corrente. Più dati inserisci, più precisi saranno i grafici.',
    action: 'Vai alle Transazioni', path: '/transactions', time: '3 min',
    completionKey: 'transactions',
  },
  {
    num: 5,
    Icon: RefreshCw,
    iconColor: '#7c3aed', iconBg: '#f5f3ff', borderColor: '#c4b5fd', doneColor: '#6ee7b7',
    title: 'Aggiungi le spese ricorrenti',
    desc: 'Netflix, abbonamenti, mutuo, utenze — inseriscili una volta sola e verranno registrati automaticamente ogni mese.',
    action: 'Vai agli Abbonamenti', path: '/bills', time: '3 min',
    completionKey: 'bills',
  },
  {
    num: 6,
    Icon: Target,
    iconColor: '#0284c7', iconBg: '#f0f9ff', borderColor: '#7dd3fc', doneColor: '#6ee7b7',
    title: 'Imposta i tuoi obiettivi di risparmio',
    desc: 'Fondo emergenza, vacanze, auto — crea obiettivi personalizzati e tieni traccia dei progressi.',
    action: 'Vai agli Obiettivi', path: '/goals', time: '2 min',
    completionKey: 'goals',
  },
]

const STEPS_FREELANCE_EXTRA: Step[] = [
  {
    num: 7,
    Icon: FileText,
    iconColor: '#4f46e5', iconBg: '#eef2ff', borderColor: '#a5b4fc', doneColor: '#6ee7b7',
    title: 'Registra le tue prime fatture',
    desc: 'Usa il Nettometro nel Freelance Hub per calcolare automaticamente tasse e INPS su ogni fattura emessa.',
    action: 'Vai al Freelance Hub', path: '/freelance', time: '2 min',
    completionKey: 'invoices',
  },
]

const TIPS = [
  { Icon: RefreshCw,  text: 'Inserisci le transazioni almeno una volta a settimana per avere dati sempre aggiornati.' },
  { Icon: BarChart2,  text: 'La Dashboard Annuale mostra i grafici solo quando ci sono transazioni — più ne inserisci, più è utile.' },
  { Icon: Layers,     text: 'Le categorie predefinite sono un punto di partenza: personalizzale in base alle tue abitudini.' },
]

// ── Componente ────────────────────────────────────────────────────────────────

export function WelcomePage() {
  const navigate = useNavigate()
  const { profile } = useAppStore()
  const isFreelance = profile?.profile_type === 'FREELANCE' || profile?.profile_type === 'BOTH'
  const steps = isFreelance ? [...STEPS_PERSONAL, ...STEPS_FREELANCE_EXTRA] : STEPS_PERSONAL

  // ── Fetch conteggi per determinare completamento ────────────────────────
  const { data: counts = {} } = useQuery({
    queryKey: ['onboarding_counts', profile?.id],
    queryFn: async () => {
      const uid = profile!.id
      const [acc, cat, bud, tx, bills, goals, inv] = await Promise.all([
        supabase.from('bank_accounts').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('categories').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('active', true),
        supabase.from('budget_plans').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('recurring_bills').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('saving_goals').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('user_id', uid),
      ])
      return {
        accounts:     (acc.count ?? 0) > 0,
        categories:   (cat.count ?? 0) > 0,
        budget:       (bud.count ?? 0) > 0,
        transactions: (tx.count ?? 0) > 0,
        bills:        (bills.count ?? 0) > 0,
        goals:        (goals.count ?? 0) > 0,
        invoices:     (inv.count ?? 0) > 0,
      } as Record<string, boolean>
    },
    enabled: !!profile,
    staleTime: 30_000,  // ricontrolla ogni 30s se la pagina resta aperta
  })

  const isDone = (key: string) => counts[key] ?? false

  const completedCount = steps.filter((s) => isDone(s.completionKey)).length
  const totalCount = steps.length
  const allDone = completedCount === totalCount
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  // Prossimo step da completare (primo non completato)
  const nextStepNum = steps.find((s) => !isDone(s.completionKey))?.num ?? null

  return (
    <div className="p-5 max-w-2xl space-y-5">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="bg-sidebar rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute right-0 top-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="absolute right-12 bottom-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center">
              {allDone ? <Trophy size={18} className="text-white" /> : <TrendingUp size={18} className="text-white" />}
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight">
                {allDone ? 'Setup completato! 🎉' : `Benvenuto${profile?.name ? `, ${profile.name}` : ''}`}
              </h1>
              <p className="text-white/50 text-xs">
                {allDone ? 'BudgetFlow è pronto al 100%' : 'BudgetFlow è pronto'}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-white/70 text-xs">
                {allDone
                  ? 'Tutto configurato — ottimo lavoro!'
                  : `${completedCount} di ${totalCount} passi completati`}
              </span>
              <span className="text-white font-bold text-sm">{progressPct}%</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
              <div
                className="h-2 rounded-full transition-all duration-700"
                style={{
                  width: `${progressPct}%`,
                  backgroundColor: progressPct === 100 ? '#6ee7b7' : '#818cf8',
                }}
              />
            </div>
          </div>

          {/* Badge profilo — mostra esplicitamente il tipo configurato */}
          <div className="flex items-center gap-2 mb-3 mt-1">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
              isFreelance ? 'bg-indigo-500/30 text-indigo-200' : 'bg-emerald-500/30 text-emerald-200'
            }`}>
              {profile?.profile_type === 'PERSONAL'  && '👤 Profilo: Privato'}
              {profile?.profile_type === 'FREELANCE' && '💼 Profilo: Freelance / P.IVA'}
              {profile?.profile_type === 'BOTH'      && '⚡ Profilo: Privato + Freelance'}
            </span>
            <button
              onClick={() => navigate('/profile-setup')}
              title="Modifica profilo e regime fiscale"
              className="text-white/30 hover:text-white/70 transition-colors"
            >
              <UserCog size={13} />
            </button>
          </div>

          {!allDone && (
            <button
              onClick={() => navigate('/')}
              className="text-xs text-white/50 hover:text-white/80 flex items-center gap-1 transition-colors"
            >
              Salta per ora e vai alla dashboard <ArrowRight size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Steps ─────────────────────────────────────────────────────────── */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 px-1">
          Primi passi consigliati
        </p>
        <div className="space-y-2">
          {steps.map((s) => {
            const done = isDone(s.completionKey)
            const isNext = !done && s.num === nextStepNum

            return (
              <div
                key={s.num}
                className={`rounded-2xl border shadow-sm p-4 flex items-start gap-4 transition-all ${
                  done
                    ? 'bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800 opacity-75'
                    : isNext
                    ? 'bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-700 shadow-md ring-1 ring-indigo-200 dark:ring-indigo-700'
                    : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:shadow-md'
                }`}
                style={{ borderLeft: `3px solid ${done ? '#6ee7b7' : isNext ? '#818cf8' : s.borderColor}` }}
              >
                {/* Icona + numero/check */}
                <div className="shrink-0 flex flex-col items-center gap-1.5">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                    style={{
                      backgroundColor: done ? '#dcfce7' : s.iconBg,
                    }}
                  >
                    {done
                      ? <CheckCircle2 size={18} className="text-emerald-500" strokeWidth={2.5} />
                      : <s.Icon size={17} strokeWidth={1.8} style={{ color: s.iconColor }} />
                    }
                  </div>
                  <span className={`text-[10px] font-bold ${done ? 'text-emerald-400' : 'text-gray-300 dark:text-gray-600'}`}>
                    {done ? '✓' : s.num}
                  </span>
                </div>

                {/* Testo */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className={`font-semibold text-sm ${
                      done
                        ? 'text-emerald-700 dark:text-emerald-400 line-through decoration-emerald-300'
                        : isNext
                        ? 'text-indigo-700 dark:text-indigo-300'
                        : 'text-gray-900 dark:text-gray-100'
                    }`}>
                      {s.title}
                    </p>
                    {isNext && (
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 rounded-full shrink-0">
                        PROSSIMO
                      </span>
                    )}
                    {!isNext && (
                      <span className={`text-[10px] bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full shrink-0 ${
                        done ? 'text-emerald-500' : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        {done ? 'completato' : `~${s.time}`}
                      </span>
                    )}
                  </div>
                  {!done && (
                    <>
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-3">{s.desc}</p>
                      <button
                        onClick={() => navigate(s.path)}
                        className={`flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                          isNext
                            ? 'text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200'
                            : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                        }`}
                      >
                        {s.action} <ArrowRight size={11} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Tutti completati ─────────────────────────────────────────────── */}
      {allDone && (
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 text-center">
          <div className="text-3xl mb-2">🎉</div>
          <p className="font-bold text-emerald-800 dark:text-emerald-300">Setup completato al 100%!</p>
          <p className="text-sm text-emerald-600 dark:text-emerald-500 mt-1">
            BudgetFlow è completamente configurato. Ora puoi usarlo al massimo.
          </p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 bg-emerald-600 text-white font-semibold px-5 py-2 rounded-xl text-sm hover:bg-emerald-700 transition-colors"
          >
            Vai alla Dashboard →
          </button>
        </div>
      )}

      {/* ── Tips ──────────────────────────────────────────────────────────── */}
      {!allDone && (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={14} className="text-amber-500" />
            <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest">Consigli utili</p>
          </div>
          <div className="space-y-2.5">
            {TIPS.map(({ Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-white dark:bg-gray-700 border border-gray-100 dark:border-gray-600 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={12} className="text-gray-400" strokeWidth={2} />
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── CTA bottom ───────────────────────────────────────────────────── */}
      {!allDone && (
        <div className="grid grid-cols-2 gap-3 pb-2">
          <button
            onClick={() => navigate(steps.find((s) => !isDone(s.completionKey))?.path ?? '/accounts')}
            className="bg-indigo-600 text-white font-semibold py-3 rounded-xl text-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
          >
            <Wallet size={15} />
            {nextStepNum === 1 ? 'Inizia dai Conti' : `Continua: passo ${nextStepNum}`}
          </button>
          <button
            onClick={() => navigate('/')}
            className="border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium py-3 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Vai alla Dashboard
          </button>
        </div>
      )}
    </div>
  )
}
