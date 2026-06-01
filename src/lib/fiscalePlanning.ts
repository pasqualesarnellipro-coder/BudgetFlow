/**
 * Motore di calcolo fiscale completo — Regime Forfettario
 * Logica basata su Legge 190/2014 e prassi AgE 2025/2026
 *
 * Regimi INPS supportati:
 *  - GESTIONE_SEPARATA: professionisti senza cassa (aliquota ~26.23%, no fisso)
 *  - IVS_ARTIGIANI:     artigiani (aliquota ~24%, quota fissa ~4.460€)
 *  - IVS_COMMERCIANTI:  commercianti (aliquota ~24.48%, quota fissa ~4.460€)
 */

import type { TaxRegime } from './database.types'

export type InpsRegime =
  | 'GESTIONE_SEPARATA'
  | 'IVS_ARTIGIANI'
  | 'IVS_COMMERCIANTI'

// ─── Costanti 2025/2026 ──────────────────────────────────────────────────────

const TAX_RATES: Record<TaxRegime, number> = {
  FORFETTARIO_5:  0.05,
  FORFETTARIO_15: 0.15,
  ORDINARIO:      0.27,
}

const INPS_RATES: Record<InpsRegime, { variabile: number; fisso: number }> = {
  GESTIONE_SEPARATA: { variabile: 0.2623, fisso: 0 },
  IVS_ARTIGIANI:     { variabile: 0.2400, fisso: 4460 },
  IVS_COMMERCIANTI:  { variabile: 0.2448, fisso: 4460 },
}

const INPS_LABEL: Record<InpsRegime, string> = {
  GESTIONE_SEPARATA: 'Gestione Separata (professionisti)',
  IVS_ARTIGIANI:     'IVS Artigiani',
  IVS_COMMERCIANTI:  'IVS Commercianti',
}

// ─── Input del calcolo ───────────────────────────────────────────────────────

export interface FiscaleInput {
  /** Fatturato P.IVA dell'anno di calcolo */
  fatturato: number
  /** Fatturato previsto per l'anno successivo (per proiezione acconti) */
  fatturatoNextYear?: number
  taxRegime: TaxRegime
  atecoCoefficient: number
  inpsRegime: InpsRegime
  /** Riduzione contributi INPS (es. 35 per prime anni artigiani) */
  inpsReductionPct: number
  /** INPS versato l'anno precedente (deduzione) */
  prevYearInps: number
  /** Acconti IS già versati nell'anno */
  accontiISPagati: number
  /** Acconti INPS già versati nell'anno */
  accontiINPSPagati: number
  /** Importo già accantonato */
  giàAccantonato: number
  /** Anno di riferimento */
  year: number
  /** Mese corrente (1-12) per calcolo rata */
  currentMonth: number
  /**
   * Caso ibrido dipendente+P.IVA:
   * Stipendio annuo lordo da lavoro dipendente (già tassato alla fonte).
   * Non altera il calcolo forfettario, ma serve per proiezione reddito totale e INPS Gestione Separata.
   */
  stipendioAnnuoLordo?: number
}

// ─── Risultato ───────────────────────────────────────────────────────────────

export interface FiscaleResult {
  // Base
  imponibileLordo: number
  imponibileNetto: number
  // Imposta Sostitutiva
  impostaSostitutiva: number
  saldoIS: number
  primoAccontoIS: number
  secondoAccontoIS: number
  // INPS
  inpsVariabile: number
  inpsFisso: number
  inpsTotale: number
  saldoINPS: number
  accontoINPS1: number
  accontoINPS2: number
  // Totali
  totaleOneri: number
  utileNetto: number
  // Rata mensile RataPilota
  rataPilota: number
  mesiRimanenti: number
  // Pct
  pressureFiscale: number
  // Label
  inpsRegimeLabel: string
  // Caso ibrido
  redditoTotale: number          // fatturato netto + stipendio netto stimato
  stipendioNettoStimato: number  // stipendio lordo × (1 - aliquota IRPEF media stimata)
  isIbrido: boolean
}

// ─── Calendario scadenze ─────────────────────────────────────────────────────

export interface ScadenzaFiscale {
  date: string          // YYYY-MM-DD
  label: string
  category: 'IS' | 'INPS_VAR' | 'INPS_FIS'
  type: 'saldo' | 'acconto' | 'fisso'
  amount: number
  cumulative: number    // saldo progressivo
  year: number
}

// ─── Calcolo principale ──────────────────────────────────────────────────────

/**
 * Stima aliquota IRPEF media per reddito da lavoro dipendente (scaglioni 2025).
 * Usata solo per calcolo indicativo del netto dipendente nel caso ibrido.
 */
function stimaAliquotaIRPEF(lordo: number): number {
  if (lordo <= 0) return 0
  // Scaglioni IRPEF 2025: 23% fino 28k, 35% fino 50k, 43% oltre
  // Approssimazione lineare media (non considera detrazioni lavoro dipendente)
  if (lordo <= 15000) return 0.23
  if (lordo <= 28000) return 0.24
  if (lordo <= 50000) return 0.31
  return 0.38
}

export function calcFiscale(input: FiscaleInput): FiscaleResult {
  const {
    fatturato, taxRegime, atecoCoefficient, inpsRegime,
    inpsReductionPct, prevYearInps, accontiISPagati, accontiINPSPagati,
    giàAccantonato, year, currentMonth,
    stipendioAnnuoLordo = 0,
  } = input

  const taxRate = TAX_RATES[taxRegime]
  const { variabile, fisso } = INPS_RATES[inpsRegime]
  const reductionFactor = 1 - inpsReductionPct / 100

  // 1. Imponibile
  const imponibileLordo = fatturato * atecoCoefficient
  const imponibileNetto = Math.max(0, imponibileLordo - prevYearInps)

  // 2. Imposta Sostitutiva
  const impostaSostitutiva = imponibileNetto * taxRate
  const saldoIS = Math.max(0, impostaSostitutiva - accontiISPagati)
  const primoAccontoIS  = impostaSostitutiva * 0.40   // rate giugno
  const secondoAccontoIS = impostaSostitutiva * 0.50  // rate novembre

  // 3. INPS
  const inpsVariabile = imponibileLordo * variabile * reductionFactor
  const inpsFisso = fisso * reductionFactor
  const inpsTotale = inpsVariabile + inpsFisso
  const saldoINPS = Math.max(0, inpsVariabile - accontiINPSPagati)
  const accontoINPS1 = inpsVariabile * 0.40
  const accontoINPS2 = inpsVariabile * 0.40

  // 4. Totale oneri
  const totaleOneri = saldoIS + primoAccontoIS + secondoAccontoIS
    + saldoINPS + accontoINPS1 + accontoINPS2
    + inpsFisso

  const utileNetto = fatturato - inpsTotale - impostaSostitutiva

  // 5. RataPilota — rata mensile da accantonare
  const scadenzeFuture = buildScadenze(input, { impostaSostitutiva, saldoIS, primoAccontoIS, secondoAccontoIS, inpsVariabile, inpsFisso, saldoINPS, accontoINPS1, accontoINPS2 })
  const totaleFuturo = scadenzeFuture
    .filter((s) => new Date(s.date) > new Date(`${year}-${String(currentMonth).padStart(2,'0')}-01`))
    .reduce((sum, s) => sum + s.amount, 0)

  const mesiRimanenti = Math.max(1, 12 - currentMonth + 1)
  const rataPilota = Math.max(0, (totaleFuturo - giàAccantonato) / mesiRimanenti)

  const pressureFiscale = fatturato > 0 ? ((impostaSostitutiva + inpsTotale) / fatturato) * 100 : 0

  // Caso ibrido: stima netto da lavoro dipendente
  const isIbrido = stipendioAnnuoLordo > 0
  const aliquotaIRPEF = stimaAliquotaIRPEF(stipendioAnnuoLordo)
  // INPS dipendente ~9.19% a carico del lavoratore
  const inpsDipendente = stipendioAnnuoLordo * 0.0919
  const stipendioNettoStimato = Math.max(0, stipendioAnnuoLordo * (1 - aliquotaIRPEF) - inpsDipendente)
  const redditoTotale = utileNetto + stipendioNettoStimato

  return {
    imponibileLordo,
    imponibileNetto,
    impostaSostitutiva,
    saldoIS,
    primoAccontoIS,
    secondoAccontoIS,
    inpsVariabile,
    inpsFisso,
    inpsTotale,
    saldoINPS,
    accontoINPS1,
    accontoINPS2,
    totaleOneri,
    utileNetto,
    rataPilota,
    mesiRimanenti,
    pressureFiscale,
    inpsRegimeLabel: INPS_LABEL[inpsRegime],
    isIbrido,
    stipendioNettoStimato,
    redditoTotale,
  }
}

// ─── Calendario scadenze ─────────────────────────────────────────────────────

interface CalcAmounts {
  impostaSostitutiva: number
  saldoIS: number
  primoAccontoIS: number
  secondoAccontoIS: number
  inpsVariabile: number
  inpsFisso: number
  saldoINPS: number
  accontoINPS1: number
  accontoINPS2: number
}

export function buildScadenze(input: FiscaleInput, amounts: CalcAmounts): ScadenzaFiscale[] {
  const { year, inpsRegime } = input
  const {
    saldoIS, primoAccontoIS, secondoAccontoIS,
    saldoINPS, accontoINPS1, accontoINPS2, inpsFisso,
  } = amounts

  const events: Omit<ScadenzaFiscale, 'cumulative'>[] = []

  // ── IS (Imposta Sostitutiva) ──────────────────────────────────────────────
  if (saldoIS > 0)
    events.push({ date: `${year}-06-30`, label: `Saldo Imp. Sostitutiva ${year-1}`, category: 'IS', type: 'saldo', amount: saldoIS, year })
  if (primoAccontoIS > 0)
    events.push({ date: `${year}-06-30`, label: `1° Acconto IS ${year} (40%)`, category: 'IS', type: 'acconto', amount: primoAccontoIS, year })
  if (secondoAccontoIS > 0)
    events.push({ date: `${year}-11-30`, label: `2° Acconto IS ${year} (50%)`, category: 'IS', type: 'acconto', amount: secondoAccontoIS, year })

  // ── INPS variabile ────────────────────────────────────────────────────────
  if (saldoINPS > 0)
    events.push({ date: `${year}-06-16`, label: `Saldo INPS ${year-1}`, category: 'INPS_VAR', type: 'saldo', amount: saldoINPS, year })
  if (accontoINPS1 > 0)
    events.push({ date: `${year}-06-16`, label: `1° Acconto INPS ${year} (40%)`, category: 'INPS_VAR', type: 'acconto', amount: accontoINPS1, year })
  if (accontoINPS2 > 0)
    events.push({ date: `${year}-11-30`, label: `2° Acconto INPS ${year} (40%)`, category: 'INPS_VAR', type: 'acconto', amount: accontoINPS2, year })

  // ── INPS fisso (IVS) ──────────────────────────────────────────────────────
  if (inpsFisso > 0 && (inpsRegime === 'IVS_ARTIGIANI' || inpsRegime === 'IVS_COMMERCIANTI')) {
    const rata = inpsFisso / 4
    events.push({ date: `${year}-05-16`, label: `INPS fisso IVS 1° rata`, category: 'INPS_FIS', type: 'fisso', amount: rata, year })
    events.push({ date: `${year}-08-20`, label: `INPS fisso IVS 2° rata`, category: 'INPS_FIS', type: 'fisso', amount: rata, year })
    events.push({ date: `${year}-11-16`, label: `INPS fisso IVS 3° rata`, category: 'INPS_FIS', type: 'fisso', amount: rata, year })
    events.push({ date: `${year+1}-02-16`, label: `INPS fisso IVS 4° rata`, category: 'INPS_FIS', type: 'fisso', amount: rata, year: year+1 })
  }

  // Sort by date
  events.sort((a, b) => a.date.localeCompare(b.date))

  // Calcola cumulativo
  let cum = 0
  return events.map((e) => {
    cum += e.amount
    return { ...e, cumulative: cum }
  })
}

// ─── RataPilota mensile (grafico) ────────────────────────────────────────────

export interface MonthlyRatePoint {
  month: string     // "Gen", "Feb"…
  rataPilota: number // rata flat mensile
  senzaPiano: number // picco senza pianificazione
}

const MONTH_SHORT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']

export function buildMonthlyRateChart(
  scadenze: ScadenzaFiscale[],
  totalOneri: number,
  year: number
): MonthlyRatePoint[] {
  const rataFlat = totalOneri / 12

  // Raggruppa scadenze per mese
  const byMonth: number[] = Array(12).fill(0)
  scadenze
    .filter((s) => s.year === year)
    .forEach((s) => {
      const m = parseInt(s.date.split('-')[1]) - 1
      byMonth[m] += s.amount
    })

  return MONTH_SHORT.map((month, i) => ({
    month,
    rataPilota: Math.round(rataFlat),
    senzaPiano: Math.round(byMonth[i]),
  }))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export { INPS_LABEL }
export const INPS_REGIME_OPTIONS: { value: InpsRegime; label: string; hint: string }[] = [
  {
    value: 'GESTIONE_SEPARATA',
    label: 'Gestione Separata',
    hint: 'Professionisti senza cassa (consulenti, copywriter, sviluppatori, designer…). Solo INPS variabile ~26%.',
  },
  {
    value: 'IVS_ARTIGIANI',
    label: 'IVS Artigiani',
    hint: 'Artigiani (idraulici, elettricisti, meccanici, parrucchieri…). INPS variabile ~24% + quota fissa ~4.460€/anno.',
  },
  {
    value: 'IVS_COMMERCIANTI',
    label: 'IVS Commercianti',
    hint: 'Commercianti (negozi, e-commerce, ambulanti…). INPS variabile ~24.5% + quota fissa ~4.460€/anno.',
  },
]
