import type { TaxRegime } from './database.types'
import type { InpsRegime } from './fiscalePlanning'

export interface NettometroResult {
  imponibile: number
  taxes: number
  inps: number
  totalAccrual: number
  netAmount: number
}

const TAX_RATES: Record<TaxRegime, number> = {
  FORFETTARIO_5:  0.05,
  FORFETTARIO_15: 0.15,
  ORDINARIO:      0.27,
}

/** Aliquote INPS 2025 per regime (variabile, al lordo di eventuali riduzioni) */
const INPS_BASE_RATES: Record<InpsRegime, number> = {
  GESTIONE_SEPARATA: 0.2623,  // INPS Circ. 35/2025
  IVS_ARTIGIANI:     0.2400,
  IVS_COMMERCIANTI:  0.2448,
}

/**
 * Calcola il netto stimato di una fattura forfettaria.
 *
 * @param grossAmount       Importo lordo fattura (€)
 * @param taxRegime         Regime fiscale
 * @param atecoCoefficient  Coefficiente di redditività ATECO (es. 0.78)
 * @param inpsRegime        Regime INPS (default: GESTIONE_SEPARATA)
 * @param inpsReductionPct  Riduzione % sull'aliquota INPS (0 = nessuna, es. 8.5 → 24%)
 *
 * ⚠️  I risultati sono INDICATIVI. Non costituiscono consulenza fiscale.
 *     Consulta il tuo commercialista per i calcoli definitivi.
 */
export function calcNetto(
  grossAmount: number,
  taxRegime: TaxRegime,
  atecoCoefficient: number,
  inpsRegime: InpsRegime = 'GESTIONE_SEPARATA',
  inpsReductionPct = 0,
): NettometroResult {
  const imponibile   = grossAmount * atecoCoefficient
  const taxes        = imponibile * TAX_RATES[taxRegime]
  const baseRate     = INPS_BASE_RATES[inpsRegime]
  const effectiveRate = baseRate * (1 - inpsReductionPct / 100)
  const inps         = imponibile * effectiveRate
  const totalAccrual = taxes + inps
  const netAmount    = grossAmount - totalAccrual
  return { imponibile, taxes, inps, totalAccrual, netAmount }
}
