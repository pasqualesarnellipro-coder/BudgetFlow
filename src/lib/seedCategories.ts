import type { ProfileType, CategoryType } from './database.types'

interface SeedCategory {
  name: string
  icon: string
  type: CategoryType
}

// ─── ENTRATE PERSONALI ────────────────────────────────────────────────────────
// Generiche per qualsiasi profilo: dipendente, autonomo, imprenditore
const INCOME_CATEGORIES: SeedCategory[] = [
  { name: 'Stipendio / Salario',    icon: '💼', type: 'INCOME' },
  { name: 'Lavoro autonomo',        icon: '🤝', type: 'INCOME' },
  { name: 'Rimborsi',               icon: '↩️', type: 'INCOME' },
  { name: 'Rendite & Affitti',      icon: '🏠', type: 'INCOME' },
  { name: 'Interessi & Dividendi',  icon: '📈', type: 'INCOME' },
  { name: 'Bonus & Premi',          icon: '🏆', type: 'INCOME' },
  { name: 'Altro reddito',          icon: '➕', type: 'INCOME' },
  { name: 'WIT',                    icon: '🎯', type: 'INCOME' },
  { name: 'Prodotti Digitali',      icon: '💻', type: 'INCOME' },
  { name: 'Regali ricevuti',        icon: '🎁', type: 'INCOME' },
]

// ─── SPESE PERSONALI ─────────────────────────────────────────────────────────
const EXPENSES_CATEGORIES: SeedCategory[] = [
  { name: 'Abitazione',             icon: '🏠', type: 'EXPENSES' },
  { name: 'Spesa alimentare',       icon: '🛒', type: 'EXPENSES' },
  { name: 'Ristoranti & Bar',       icon: '🍽️', type: 'EXPENSES' },
  { name: 'Trasporti',              icon: '🚇', type: 'EXPENSES' },
  { name: 'Auto & Carburante',      icon: '⛽', type: 'EXPENSES' },
  { name: 'Salute & Farmaci',       icon: '🩺', type: 'EXPENSES' },
  { name: 'Abbonamenti & Streaming',icon: '📺', type: 'EXPENSES' },
  { name: 'Telefono & Internet',    icon: '📱', type: 'EXPENSES' },
  { name: 'Abbigliamento',          icon: '👔', type: 'EXPENSES' },
  { name: 'Sport & Benessere',      icon: '🏃', type: 'EXPENSES' },
  { name: 'Istruzione & Corsi',     icon: '🎓', type: 'EXPENSES' },
  { name: 'Cultura & Svago',        icon: '🎭', type: 'EXPENSES' },
  { name: 'Viaggi & Vacanze',       icon: '✈️', type: 'EXPENSES' },
  { name: 'Assicurazioni',          icon: '🛡️', type: 'EXPENSES' },
  { name: 'Tasse & Imposte',        icon: '🏛️', type: 'EXPENSES' },
  { name: 'Regali',                 icon: '🎁', type: 'EXPENSES' },
  { name: 'Altro',                  icon: '📋', type: 'EXPENSES' },
  { name: 'Utenze',                 icon: '⚡', type: 'EXPENSES' },
  { name: 'Bellezza & Cura',        icon: '💄', type: 'EXPENSES' },
  { name: 'Animali domestici',      icon: '🐾', type: 'EXPENSES' },
  { name: 'Casa & Arredo',          icon: '🛋️', type: 'EXPENSES' },
  { name: 'Strumenti lavoro',       icon: '🖥️', type: 'EXPENSES' },
]

// ─── RISPARMI ────────────────────────────────────────────────────────────────
const SAVINGS_CATEGORIES: SeedCategory[] = [
  { name: 'Fondo emergenza',        icon: '🔐', type: 'SAVINGS' },
  { name: 'Pensione integrativa',   icon: '🌅', type: 'SAVINGS' },
  { name: 'Investimenti',           icon: '📊', type: 'SAVINGS' },
  { name: 'Obiettivo casa',         icon: '🏡', type: 'SAVINGS' },
  { name: 'Risparmio viaggi',       icon: '🧳', type: 'SAVINGS' },
  { name: 'Fondo acquisti',         icon: '🎯', type: 'SAVINGS' },
  { name: 'Altro risparmio',        icon: '🏦', type: 'SAVINGS' },
]

// ─── DEBITI ──────────────────────────────────────────────────────────────────
const DEBTS_CATEGORIES: SeedCategory[] = [
  { name: 'Mutuo casa',             icon: '🔑', type: 'DEBTS' },
  { name: 'Prestito personale',     icon: '📝', type: 'DEBTS' },
  { name: 'Carta di credito',       icon: '💳', type: 'DEBTS' },
  { name: 'Leasing / Rate',         icon: '📅', type: 'DEBTS' },
  { name: 'Altro debito',           icon: '⚖️', type: 'DEBTS' },
  { name: 'Noleggio / Leasing Auto',icon: '🚗', type: 'DEBTS' },
]

// ─── ENTRATE BUSINESS (FREELANCE / P.IVA) ────────────────────────────────────
// Categoria neutra — adatta a copywriter, developer, designer, consulente, coach…
const BUSINESS_INCOME_CATEGORIES: SeedCategory[] = [
  { name: 'Fatture clienti',          icon: '🧾', type: 'BUSINESS_INCOME' },
  { name: 'Consulenze & Progetti',    icon: '💡', type: 'BUSINESS_INCOME' },
  { name: 'Commissioni & Provvigioni',icon: '🤝', type: 'BUSINESS_INCOME' },
  { name: 'Licenze & Diritti',        icon: '©️', type: 'BUSINESS_INCOME' },
  { name: 'Rimborsi spese clienti',   icon: '↩️', type: 'BUSINESS_INCOME' },
  { name: 'Altro reddito business',   icon: '➕', type: 'BUSINESS_INCOME' },
]

// ─── SPESE BUSINESS (FREELANCE / P.IVA) ──────────────────────────────────────
const BUSINESS_EXPENSES_CATEGORIES: SeedCategory[] = [
  { name: 'Strumenti & Software',     icon: '🖥️', type: 'BUSINESS_EXPENSES' },
  { name: 'Formazione & Aggiornamento',icon: '📚', type: 'BUSINESS_EXPENSES' },
  { name: 'Marketing & Comunicazione',icon: '📣', type: 'BUSINESS_EXPENSES' },
  { name: 'Commercialista & Legale',  icon: '⚖️', type: 'BUSINESS_EXPENSES' },
  { name: 'Spese ufficio',            icon: '🗂️', type: 'BUSINESS_EXPENSES' },
  { name: 'Trasferte business',       icon: '🚄', type: 'BUSINESS_EXPENSES' },
  { name: 'Telefono & Internet biz',  icon: '📡', type: 'BUSINESS_EXPENSES' },
  { name: 'Altra spesa business',     icon: '📋', type: 'BUSINESS_EXPENSES' },
]

const PERSONAL_CATEGORIES: SeedCategory[] = [
  ...INCOME_CATEGORIES,
  ...EXPENSES_CATEGORIES,
  ...SAVINGS_CATEGORIES,
  ...DEBTS_CATEGORIES,
]

export function getSeedCategories(profileType: ProfileType): SeedCategory[] {
  const base = PERSONAL_CATEGORIES
  if (profileType === 'PERSONAL') return base
  return [
    ...base,
    ...BUSINESS_INCOME_CATEGORIES,
    ...BUSINESS_EXPENSES_CATEGORIES,
  ]
}
