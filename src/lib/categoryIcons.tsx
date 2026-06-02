import {
  Briefcase, Monitor, RotateCcw, Home, TrendingUp, Trophy, Plus,
  Zap, Package, Gift, Mountain, ShoppingCart, Coffee, Car, HeartPulse,
  Tv, Wifi, Shirt, Dumbbell, GraduationCap, Music2, Plane, Shield,
  Landmark, MoreHorizontal, Sparkles, PawPrint, Sofa, Wrench,
  PiggyBank, Sunset, BarChart2, Luggage, Target, Key, FileText,
  CreditCard, Calendar, Scale, Receipt, Lightbulb, BookOpen,
  Megaphone, Fuel, Bus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const TYPE_COLORS: Record<string, string> = {
  INCOME:            '#10b981',
  BUSINESS_INCOME:   '#10b981',
  EXPENSES:          '#f43f5e',
  BUSINESS_EXPENSES: '#f43f5e',
  SAVINGS:           '#f59e0b',
  DEBTS:             '#8b5cf6',
}

export const TYPE_BG: Record<string, string> = {
  INCOME:            '#ecfdf5',
  BUSINESS_INCOME:   '#ecfdf5',
  EXPENSES:          '#fff1f2',
  BUSINESS_EXPENSES: '#fff1f2',
  SAVINGS:           '#fffbeb',
  DEBTS:             '#f5f3ff',
}

// Mapping nome categoria → icona Lucide
const ICON_MAP: Record<string, LucideIcon> = {
  // INCOME
  'stipendio / salario': Briefcase,
  'lavoro autonomo':     Monitor,
  'rimborsi':            RotateCcw,
  'rendite & affitti':   Home,
  'interessi & dividendi': TrendingUp,
  'bonus & premi':       Trophy,
  'altro reddito':       Plus,
  'wit':                 Zap,
  'prodotti digitali':   Package,
  'regali ricevuti':     Gift,
  'terreno':             Mountain,
  // EXPENSES
  'abitazione':          Home,
  'spesa alimentare':    ShoppingCart,
  'ristoranti & bar':    Coffee,
  'trasporti':           Bus,
  'auto & carburante':   Fuel,
  'salute & farmaci':    HeartPulse,
  'abbonamenti & streaming': Tv,
  'telefono & internet': Wifi,
  'abbigliamento':       Shirt,
  'sport & benessere':   Dumbbell,
  'istruzione & corsi':  GraduationCap,
  'cultura & svago':     Music2,
  'viaggi & vacanze':    Plane,
  'assicurazioni':       Shield,
  'tasse & imposte':     Landmark,
  'regali':              Gift,
  'altro':               MoreHorizontal,
  'utenze':              Zap,
  'bellezza & cura':     Sparkles,
  'animali domestici':   PawPrint,
  'casa & arredo':       Sofa,
  'strumenti lavoro':    Wrench,
  // SAVINGS
  'fondo emergenza':     Shield,
  'pensione integrativa': Sunset,
  'investimenti':        BarChart2,
  'obiettivo casa':      Home,
  'risparmio viaggi':    Luggage,
  'fondo acquisti':      Target,
  'altro risparmio':     PiggyBank,
  // DEBTS
  'mutuo casa':          Key,
  'prestito personale':  FileText,
  'carta di credito':    CreditCard,
  'leasing / rate':      Calendar,
  'altro debito':        Scale,
  'noleggio / leasing auto': Car,
  // BUSINESS INCOME
  'fatture clienti':     Receipt,
  'consulenze & progetti': Lightbulb,
  'commissioni & provvigioni': Trophy,
  'licenze & diritti':   Package,
  'rimborsi spese clienti': RotateCcw,
  'altro reddito business': Plus,
  // BUSINESS EXPENSES
  'strumenti & software': Monitor,
  'formazione & aggiornamento': BookOpen,
  'marketing & comunicazione': Megaphone,
  'commercialista & legale': Scale,
  'spese ufficio':       FileText,
  'trasferte business':  Plane,
  'telefono & internet biz': Wifi,
  'altra spesa business': MoreHorizontal,
}

// Icone default per tipo (fallback se il nome non è nel mapping)
const TYPE_DEFAULT: Record<string, LucideIcon> = {
  INCOME:            TrendingUp,
  BUSINESS_INCOME:   TrendingUp,
  EXPENSES:          ShoppingCart,
  BUSINESS_EXPENSES: ShoppingCart,
  SAVINGS:           PiggyBank,
  DEBTS:             CreditCard,
}

export function getCategoryIcon(name: string, type: string): LucideIcon {
  return ICON_MAP[name.toLowerCase()] ?? TYPE_DEFAULT[type] ?? MoreHorizontal
}

interface CategoryIconProps {
  name: string
  type: string
  size?: number
  className?: string
}

export function CategoryIcon({ name, type, size = 16, className }: CategoryIconProps) {
  const Icon = getCategoryIcon(name, type)
  const color = TYPE_COLORS[type] ?? '#6b7280'
  const bg = TYPE_BG[type] ?? '#f9fafb'
  return (
    <div
      className={`rounded-lg flex items-center justify-center shrink-0 ${className ?? ''}`}
      style={{ backgroundColor: bg, width: size + 16, height: size + 16 }}
    >
      <Icon size={size} style={{ color }} strokeWidth={1.8} />
    </div>
  )
}
