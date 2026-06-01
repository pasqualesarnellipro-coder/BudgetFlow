import type { TaxRegime } from './database.types'

export interface NettometroResult {
  imponibile: number
  taxes: number
  inps: number
  totalAccrual: number
  netAmount: number
}

const TAX_RATES: Record<TaxRegime, number> = {
  FORFETTARIO_5: 0.05,
  FORFETTARIO_15: 0.15,
  ORDINARIO: 0.27,
}

export function calcNetto(
  grossAmount: number,
  taxRegime: TaxRegime,
  atecoCoefficient: number
): NettometroResult {
  const imponibile = grossAmount * atecoCoefficient
  const taxes = imponibile * TAX_RATES[taxRegime]
  const inps = imponibile * 0.2623
  const totalAccrual = taxes + inps
  const netAmount = grossAmount - totalAccrual
  return { imponibile, taxes, inps, totalAccrual, netAmount }
}
