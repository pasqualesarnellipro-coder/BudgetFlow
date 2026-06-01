import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, X, MapIcon } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'

const STORAGE_KEY = 'bf_onboarding_done'

interface StepDef {
  path: string
  label: string
  nextPath: string
  nextLabel: string
}

// Ordine corretto: Conti → Categorie → Budget → Transazioni → Abbonamenti → Obiettivi
const STEPS_PERSONAL: StepDef[] = [
  { path: '/accounts',     label: 'Aggiungi il primo conto',          nextPath: '/categories',   nextLabel: 'Controlla le categorie' },
  { path: '/categories',   label: 'Controlla le categorie',           nextPath: '/budget',       nextLabel: 'Pianifica il budget' },
  { path: '/budget',       label: 'Pianifica il budget mensile',      nextPath: '/transactions', nextLabel: 'Aggiungi transazioni' },
  { path: '/transactions', label: 'Aggiungi le prime transazioni',    nextPath: '/bills',        nextLabel: 'Spese ricorrenti' },
  { path: '/bills',        label: 'Aggiungi le spese ricorrenti',     nextPath: '/goals',        nextLabel: 'Obiettivi di risparmio' },
  { path: '/goals',        label: 'Imposta gli obiettivi',            nextPath: '/welcome',      nextLabel: 'Completa setup' },
]

const STEPS_FREELANCE: StepDef[] = [
  { path: '/accounts',     label: 'Aggiungi il primo conto',          nextPath: '/categories',   nextLabel: 'Controlla le categorie' },
  { path: '/categories',   label: 'Controlla le categorie',           nextPath: '/budget',       nextLabel: 'Pianifica il budget' },
  { path: '/budget',       label: 'Pianifica il budget mensile',      nextPath: '/transactions', nextLabel: 'Aggiungi transazioni' },
  { path: '/transactions', label: 'Aggiungi le prime transazioni',    nextPath: '/bills',        nextLabel: 'Spese ricorrenti' },
  { path: '/bills',        label: 'Aggiungi le spese ricorrenti',     nextPath: '/goals',        nextLabel: 'Obiettivi di risparmio' },
  { path: '/goals',        label: 'Imposta gli obiettivi',            nextPath: '/freelance',    nextLabel: 'Registra le prime fatture' },
  { path: '/freelance',    label: 'Registra le prime fatture',        nextPath: '/welcome',      nextLabel: 'Completa setup' },
]

export function OnboardingBanner() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { profile } = useAppStore()
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem(STORAGE_KEY))

  if (dismissed) return null

  const isFreelance = profile?.profile_type === 'FREELANCE' || profile?.profile_type === 'BOTH'
  const steps = isFreelance ? STEPS_FREELANCE : STEPS_PERSONAL
  const totalSteps = steps.length
  const stepIndex = steps.findIndex((s) => s.path === pathname)

  if (stepIndex === -1) return null

  const current = steps[stepIndex]
  const stepNum = stepIndex + 1
  const isLast = current.nextPath === '/welcome'

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem(STORAGE_KEY, '1')
      setDismissed(true)
    }
    navigate(current.nextPath)
  }

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-indigo-100 dark:border-gray-700 shadow-[0_-2px_12px_rgba(0,0,0,0.06)] px-5 py-3 flex items-center gap-3 z-10">
      <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0">
        <MapIcon size={14} className="text-white" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-none mb-0.5">
          Guida iniziale · Passo {stepNum} di {totalSteps}
        </p>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{current.label}</p>
      </div>

      {/* Progress dots */}
      <div className="hidden sm:flex items-center gap-1 shrink-0">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all ${
              i < stepNum ? 'w-4 h-1.5 bg-indigo-500' :
              i === stepIndex ? 'w-4 h-1.5 bg-indigo-300' :
              'w-1.5 h-1.5 bg-gray-200 dark:bg-gray-600'
            }`}
          />
        ))}
      </div>

      <button
        onClick={handleNext}
        className="shrink-0 flex items-center gap-1.5 bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors"
      >
        {isLast ? 'Completa ✓' : <>{current.nextLabel} <ArrowRight size={13} /></>}
      </button>

      <button
        onClick={handleDismiss}
        title="Nascondi guida"
        className="shrink-0 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 transition-colors"
      >
        <X size={15} />
      </button>
    </div>
  )
}
