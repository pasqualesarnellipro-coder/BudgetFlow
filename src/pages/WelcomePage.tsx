import { useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/useAppStore'
import {
  Tags, PieChart, ArrowLeftRight, RefreshCw, Target,
  FileText, Lightbulb, BarChart2, Layers, ArrowRight,
  CheckCircle2, TrendingUp, Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Step {
  num: number
  Icon: LucideIcon
  iconColor: string
  iconBg: string
  borderColor: string
  title: string
  desc: string
  action: string
  path: string
  time: string
}

const STEPS_PERSONAL: Step[] = [
  {
    num: 1,
    Icon: Wallet,
    iconColor: '#4f46e5',
    iconBg: '#eef2ff',
    borderColor: '#a5b4fc',
    title: 'Aggiungi il tuo primo conto',
    desc: 'Collega il conto corrente, la carta o il portafoglio contanti. Serve per associare le transazioni — senza conto il salvataggio non funziona.',
    action: 'Vai ai Conti',
    path: '/accounts',
    time: '1 min',
  },
  {
    num: 2,
    Icon: Tags,
    iconColor: '#059669',
    iconBg: '#ecfdf5',
    borderColor: '#6ee7b7',
    title: 'Controlla le categorie',
    desc: 'Abbiamo creato le categorie di default per te. Aggiungine di nuove, rinominale o disattiva quelle che non usi.',
    action: 'Vai alle Categorie',
    path: '/categories',
    time: '2 min',
  },
  {
    num: 3,
    Icon: PieChart,
    iconColor: '#e11d48',
    iconBg: '#fff1f2',
    borderColor: '#fda4af',
    title: 'Pianifica il budget mensile',
    desc: 'Inserisci quanto vuoi spendere per ogni categoria ogni mese. È la base di tutto il sistema di controllo.',
    action: 'Vai al Budget Annuale',
    path: '/budget',
    time: '5 min',
  },
  {
    num: 4,
    Icon: ArrowLeftRight,
    iconColor: '#d97706',
    iconBg: '#fffbeb',
    borderColor: '#fcd34d',
    title: 'Aggiungi le prime transazioni',
    desc: 'Registra entrate e uscite del mese corrente. Più dati inserisci, più precisi saranno i grafici.',
    action: 'Vai alle Transazioni',
    path: '/transactions',
    time: '3 min',
  },
  {
    num: 5,
    Icon: RefreshCw,
    iconColor: '#7c3aed',
    iconBg: '#f5f3ff',
    borderColor: '#c4b5fd',
    title: 'Aggiungi le spese ricorrenti',
    desc: 'Netflix, abbonamenti, mutuo, utenze — inseriscili una volta sola e verranno registrati automaticamente ogni mese.',
    action: 'Vai agli Abbonamenti',
    path: '/bills',
    time: '3 min',
  },
  {
    num: 6,
    Icon: Target,
    iconColor: '#0284c7',
    iconBg: '#f0f9ff',
    borderColor: '#7dd3fc',
    title: 'Imposta i tuoi obiettivi di risparmio',
    desc: 'Fondo emergenza, vacanze, auto — crea obiettivi personalizzati e tieni traccia dei progressi.',
    action: 'Vai agli Obiettivi',
    path: '/goals',
    time: '2 min',
  },
]

const STEPS_FREELANCE_EXTRA: Step[] = [
  {
    num: 7,
    Icon: FileText,
    iconColor: '#4f46e5',
    iconBg: '#eef2ff',
    borderColor: '#a5b4fc',
    title: 'Registra le tue prime fatture',
    desc: 'Usa il Nettometro nel Freelance Hub per calcolare automaticamente tasse e INPS su ogni fattura emessa.',
    action: 'Vai al Freelance Hub',
    path: '/freelance',
    time: '2 min',
  },
]

const TIPS = [
  {
    Icon: RefreshCw,
    text: 'Inserisci le transazioni almeno una volta a settimana per avere dati sempre aggiornati.',
  },
  {
    Icon: BarChart2,
    text: 'La Dashboard Annuale mostra i grafici solo quando ci sono transazioni — più ne inserisci, più è utile.',
  },
  {
    Icon: Layers,
    text: 'Le categorie predefinite sono un punto di partenza: personalizzale in base alle tue abitudini.',
  },
]

export function WelcomePage() {
  const navigate = useNavigate()
  const { profile } = useAppStore()

  const isFreelance = profile?.profile_type === 'FREELANCE' || profile?.profile_type === 'BOTH'
  const steps = isFreelance ? [...STEPS_PERSONAL, ...STEPS_FREELANCE_EXTRA] : STEPS_PERSONAL

  return (
    <div className="p-5 max-w-2xl space-y-5">

      {/* Hero */}
      <div className="bg-sidebar rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute right-0 top-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="absolute right-12 bottom-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center">
              <TrendingUp size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight">
                Benvenuto{profile?.name ? `, ${profile.name}` : ''}
              </h1>
              <p className="text-white/50 text-xs">BudgetFlow è pronto</p>
            </div>
          </div>
          <p className="text-white/70 text-sm leading-relaxed mb-4 max-w-lg">
            Segui i passi qui sotto per configurare l'app in circa{' '}
            <span className="text-white font-semibold">15 minuti</span>.
            Puoi tornare su questa pagina in qualsiasi momento dalla sidebar.
          </p>
          <button
            onClick={() => navigate('/')}
            className="text-xs text-white/50 hover:text-white/80 flex items-center gap-1 transition-colors"
          >
            Salta per ora e vai alla dashboard <ArrowRight size={12} />
          </button>
        </div>
      </div>

      {/* Steps */}
      <div>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 px-1">
          Primi passi consigliati
        </p>
        <div className="space-y-2">
          {steps.map((s) => (
            <div
              key={s.num}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 flex items-start gap-4 hover:shadow-md transition-shadow"
              style={{ borderLeft: `3px solid ${s.borderColor}` }}
            >
              {/* Numero + icona */}
              <div className="shrink-0 flex flex-col items-center gap-1.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: s.iconBg }}
                >
                  <s.Icon size={17} strokeWidth={1.8} style={{ color: s.iconColor }} />
                </div>
                <span className="text-[10px] font-bold text-gray-300 dark:text-gray-600">{s.num}</span>
              </div>

              {/* Testo */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{s.title}</p>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full shrink-0">
                    ~{s.time}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mb-3">{s.desc}</p>
                <button
                  onClick={() => navigate(s.path)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                >
                  {s.action} <ArrowRight size={11} />
                </button>
              </div>

              <CheckCircle2 size={16} className="text-gray-200 shrink-0 mt-0.5" />
            </div>
          ))}
        </div>
      </div>

      {/* Tips */}
      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb size={14} className="text-amber-500" />
          <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Consigli utili</p>
        </div>
        <div className="space-y-2.5">
          {TIPS.map(({ Icon, text }, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-lg bg-white border border-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                <Icon size={12} className="text-gray-400" strokeWidth={2} />
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA bottom */}
      <div className="grid grid-cols-2 gap-3 pb-2">
        <button
          onClick={() => navigate('/accounts')}
          className="bg-indigo-600 text-white font-semibold py-3 rounded-xl text-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
        >
          <Wallet size={15} />
          Inizia dai Conti
        </button>
        <button
          onClick={() => navigate('/')}
          className="border border-gray-200 text-gray-700 font-medium py-3 rounded-xl text-sm hover:bg-gray-50 transition-colors"
        >
          Vai alla Dashboard
        </button>
      </div>
    </div>
  )
}
