/**
 * Parser per l'importazione di transazioni da CSV, Excel e PDF bancari.
 * Supporta i formati più comuni delle banche italiane.
 */

import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export interface ParsedRow {
  date: string        // YYYY-MM-DD
  description: string
  amount: number      // positivo = entrata, negativo = uscita
  rawDate: string
  rawAmount: string
  rowIndex: number
}

export interface ColumnMap {
  date: string
  description: string
  amount: string
  /** Se la banca usa colonne separate per DARE/AVERE */
  amountIn?: string
  amountOut?: string
  /** Separatore decimale rilevato */
  decimalSep: ',' | '.'
}

export interface ImportPreviewResult {
  headers: string[]
  rows: Record<string, string>[]
  suggested: ColumnMap
  parsed: ParsedRow[]
  fileName: string
  totalRows: number
  warnings: string[]
}

// ─── Normalizzazione importi ─────────────────────────────────────────────────

/**
 * Parsing robusto di importi monetari.
 * Gestisce: 1.234,56 | 1,234.56 | 1234.56 | 1234,56 | -12.50 | +0.00
 * Non dipende dal decimalSep dichiarato — lo inferisce dal valore stesso.
 */
export function parseAmount(raw: string, _decimalSep?: ',' | '.'): number {
  if (!raw) return 0
  let s = raw.trim()

  // Rimuovi spazi, simboli valuta, apici
  s = s.replace(/[\s€$£¥₹]/g, '').replace(/['"]/g, '')
  if (!s) return 0

  // Estrai segno
  const negative = s.startsWith('-')
  s = s.replace(/^[+-]/, '')

  // Caso 1: ha sia punto che virgola → determina quale è decimale
  if (s.includes('.') && s.includes(',')) {
    const lastDot   = s.lastIndexOf('.')
    const lastComma = s.lastIndexOf(',')
    if (lastComma > lastDot) {
      // virgola è l'ultimo separatore → decimale italiano  es. 1.234,56
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // punto è l'ultimo separatore → decimale internazionale  es. 1,234.56
      s = s.replace(/,/g, '')
    }
  }
  // Caso 2: solo virgola
  else if (s.includes(',') && !s.includes('.')) {
    const parts = s.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      // virgola decimale  es. 1234,56 o 12,5
      s = s.replace(',', '.')
    } else {
      // virgola migliaia  es. 1,234,567 → rimuovi
      s = s.replace(/,/g, '')
    }
  }
  // Caso 3: solo punto
  else if (s.includes('.') && !s.includes(',')) {
    const parts = s.split('.')
    if (parts.length === 2 && parts[1].length <= 2) {
      // punto decimale  es. 1234.56 ✓ — non toccare
    } else if (parts.length > 2) {
      // punto migliaia  es. 1.234.567 → rimuovi tutti tranne ultimo
      const last = parts.pop()!
      s = parts.join('') + '.' + last
    }
    // else: numero intero con punto unico ma > 2 decimali → lascia così
  }

  const n = parseFloat(s)
  if (isNaN(n)) return 0
  return negative ? -n : n
}

function detectDecimalSep(samples: string[]): ',' | '.' {
  let commaDecCount = 0, dotDecCount = 0
  for (const raw of samples) {
    const s = raw.trim().replace(/[\s€$£]/g, '')
    if (/,\d{1,2}$/.test(s) && !s.includes('.')) commaDecCount++
    if (/\.\d{1,2}$/.test(s) && !s.includes(',')) dotDecCount++
  }
  return commaDecCount > dotDecCount ? ',' : '.'
}

// ─── Normalizzazione date ────────────────────────────────────────────────────

function parseDate(raw: string): string {
  if (!raw) return ''
  const s = raw.trim()

  // YYYY-MM-DD già ok
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // DD/MM/YYYY o DD-MM-YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`

  // DD/MM/YY
  const m2 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/)
  if (m2) {
    const year = parseInt(m2[3]) > 50 ? `19${m2[3]}` : `20${m2[3]}`
    return `${year}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`
  }

  // MM/DD/YYYY (formato US, meno comune)
  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m3) {
    // Euristica: se il primo numero > 12, è DD/MM
    if (parseInt(m3[1]) > 12) {
      return `${m3[3]}-${m3[2].padStart(2,'0')}-${m3[1].padStart(2,'0')}`
    }
    return `${m3[3]}-${m3[1].padStart(2,'0')}-${m3[2].padStart(2,'0')}`
  }

  return ''
}

// ─── Rilevamento automatico colonne ─────────────────────────────────────────

const DATE_KEYWORDS = [
  'data contabile', 'data operazione', 'data valuta', 'data movim',
  'booking date', 'value date', 'started date', 'completed date', 'date',
  'data',
]
const DESC_KEYWORDS = [
  'descrizione operazione', 'descrizione', 'causale', 'dettaglio',
  'description', 'memo', 'narrative', 'operazione', 'diciture',
  'beneficiario', 'riferimento', 'note',
]
const AMOUNT_KEYWORDS = [
  'importo eur', 'importo', 'ammontare', 'amount (eur)', 'amount',
  'valore', 'saldo movim', 'totale',
]
// Colonne "Avere" / Entrate (positivo)
const IN_KEYWORDS = [
  'entrate', 'entrata', 'avere', 'accredito', 'credito',
  'credit', 'money in', 'income',
]
// Colonne "Dare" / Uscite (negativo)
const OUT_KEYWORDS = [
  'uscite', 'uscita', 'dare', 'addebito', 'debito',
  'debit', 'money out', 'expense', 'spesa',
]

function scoreHeader(header: string, keywords: string[]): number {
  const h = header.toLowerCase().trim()
  for (const kw of keywords) {
    if (h === kw) return 10                        // match esatto
    if (h.startsWith(kw) || kw.startsWith(h)) return 6
    if (h.includes(kw)) return 4
    if (kw.includes(h) && h.length > 3) return 2
  }
  return 0
}

export function suggestColumns(headers: string[], rows: Record<string, string>[]): ColumnMap {
  // Score ogni header contro tutti i tipi di colonna
  const scored = headers.map((h) => ({
    h,
    dateScore:    scoreHeader(h, DATE_KEYWORDS),
    descScore:    scoreHeader(h, DESC_KEYWORDS),
    amountScore:  scoreHeader(h, AMOUNT_KEYWORDS),
    inScore:      scoreHeader(h, IN_KEYWORDS),
    outScore:     scoreHeader(h, OUT_KEYWORDS),
  }))

  const byDate    = [...scored].sort((a, b) => b.dateScore   - a.dateScore)
  const byDesc    = [...scored].sort((a, b) => b.descScore   - a.descScore)
  const byAmount  = [...scored].sort((a, b) => b.amountScore - a.amountScore)
  const byIn      = [...scored].sort((a, b) => b.inScore     - a.inScore)
  const byOut     = [...scored].sort((a, b) => b.outScore    - a.outScore)

  const dateCol     = byDate[0]?.h   ?? headers[0] ?? ''
  const descCol     = byDesc[0]?.h   ?? headers[1] ?? ''
  const amountInCol = byIn[0]?.inScore  > 0 ? byIn[0].h  : ''
  const amountOutCol= byOut[0]?.outScore > 0 ? byOut[0].h : ''
  const amountCol   = byAmount[0]?.amountScore > 0 ? byAmount[0].h : ''

  // ─── Decide se usare colonne split (DARE/AVERE) o singola ──────────────────
  // Usa split se: entrambe le colonne IN/OUT esistono, sono diverse,
  // e il loro score è abbastanza alto (evita falsi positivi)
  const splitConfidence = (byIn[0]?.inScore ?? 0) + (byOut[0]?.outScore ?? 0)
  const singleConfidence = byAmount[0]?.amountScore ?? 0

  const useSplit = amountInCol && amountOutCol &&
    amountInCol !== amountOutCol &&
    splitConfidence >= 8 &&          // almeno un match parziale su entrambe
    splitConfidence >= singleConfidence  // split vince su singola

  // Campioni per rilevare separatore decimale
  const sampleCol = useSplit ? amountInCol : amountCol
  const amountSamples = rows
    .slice(0, 20)
    .map((r) => r[sampleCol] || (useSplit ? r[amountOutCol] : '') || '')
    .filter((v) => v && v.trim() !== '' && v.trim() !== '-')

  const decimalSep = detectDecimalSep(amountSamples)

  return {
    date:        dateCol,
    description: descCol,
    amount:      useSplit ? amountCol : (amountCol || amountInCol || (headers[2] ?? '')),
    amountIn:    useSplit ? amountInCol  : undefined,
    amountOut:   useSplit ? amountOutCol : undefined,
    decimalSep,
  }
}

// ─── Parsing righe → ParsedRow ───────────────────────────────────────────────

export function applyColumnMap(rows: Record<string, string>[], map: ColumnMap): ParsedRow[] {
  const result: ParsedRow[] = []

  rows.forEach((row, i) => {
    const rawDate = row[map.date] ?? ''
    const rawDesc = row[map.description] ?? ''

    let amount = 0
    let rawAmount = ''

    if (map.amountIn && map.amountOut) {
      const inVal = parseAmount(row[map.amountIn] ?? '', map.decimalSep)
      const outVal = parseAmount(row[map.amountOut] ?? '', map.decimalSep)
      amount = inVal > 0 ? inVal : -Math.abs(outVal)
      rawAmount = row[map.amountIn] || row[map.amountOut] || ''
    } else {
      rawAmount = row[map.amount] ?? ''
      amount = parseAmount(rawAmount, map.decimalSep)
    }

    const date = parseDate(rawDate)
    if (!date && !rawDate) return  // salta righe senza data
    if (amount === 0 && !rawAmount) return  // salta righe vuote

    // Descrizione: combina CAUSALE + DESCRIZIONE se entrambe presenti
    let description = rawDesc.trim()
    if (map.description !== map.date) {
      // Cerca anche colonne "causale" secondarie non mappate
      const causale = (row['CAUSALE'] ?? row['Causale'] ?? row['causale'] ?? '').trim()
      const descOp  = (row['DESCRIZIONE OPERAZIONE'] ?? row['Descrizione Operazione'] ?? '').trim()
      if (!description && causale) description = causale
      else if (description && causale && causale !== description) description = `${description} — ${causale}`
      else if (!description && descOp) description = descOp
    }

    result.push({
      date: date || rawDate,
      description: description || rawDesc.trim(),
      amount,
      rawDate,
      rawAmount,
      rowIndex: i,
    })
  })

  return result
}

// ─── Parser CSV ──────────────────────────────────────────────────────────────

export async function parseCSV(file: File): Promise<ImportPreviewResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete: (results) => {
        const headers = results.meta.fields ?? []
        const rows = results.data as Record<string, string>[]
        const suggested = suggestColumns(headers, rows)
        const parsed = applyColumnMap(rows, suggested)
        const warnings: string[] = []
        if (results.errors.length > 0) {
          warnings.push(`${results.errors.length} righe con errori di parsing ignorate.`)
        }
        resolve({ headers, rows, suggested, parsed, fileName: file.name, totalRows: rows.length, warnings })
      },
      error: reject,
    })
  })
}

// ─── Parser Excel ─────────────────────────────────────────────────────────────

export async function parseExcel(file: File): Promise<ImportPreviewResult> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'YYYY-MM-DD' })

  if (raw.length < 2) throw new Error('File Excel vuoto o non valido.')

  // Prima riga non vuota = headers
  let headerIdx = 0
  while (headerIdx < raw.length && (raw[headerIdx] as string[]).every((c) => !c)) headerIdx++

  const headers = (raw[headerIdx] as string[]).map((h) => String(h ?? '').trim()).filter(Boolean)
  const dataRows = raw.slice(headerIdx + 1).map((row) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = String((row as string[])[i] ?? '').trim() })
    return obj
  }).filter((r) => Object.values(r).some((v) => v))

  const suggested = suggestColumns(headers, dataRows)
  const parsed = applyColumnMap(dataRows, suggested)

  return { headers, rows: dataRows, suggested, parsed, fileName: file.name, totalRows: dataRows.length, warnings: [] }
}

// ─── Parser PDF (text extraction) ────────────────────────────────────────────

export async function parsePDF(file: File): Promise<ImportPreviewResult> {
  // Importa pdfjs-dist dinamicamente (pesante)
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()

  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise

  let fullText = ''
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const lines = content.items.map((item) => ('str' in item ? (item as { str: string }).str : '')).join(' ')
    fullText += lines + '\n'
  }

  // Parsing euristico: cerca righe con data + importo
  const lines = fullText.split('\n').map((l) => l.trim()).filter(Boolean)
  const rows: Record<string, string>[] = []

  for (const line of lines) {
    // Pattern: data + testo + importo (es. "15/03/2024 Pagamento carta 123,45")
    const m = line.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s+(.+?)\s+([-+]?\d[\d.,]+)\s*$/)
    if (m) {
      rows.push({ Data: m[1], Descrizione: m[2].trim(), Importo: m[3] })
    }
  }

  if (rows.length === 0) {
    throw new Error(
      'PDF non leggibile automaticamente.\n\n' +
      'Il PDF della tua banca ha un formato che non riesco a interpretare — è normale, ogni banca usa un layout diverso.\n\n' +
      'Soluzione: entra nel sito/app della tua banca → Movimenti → Esporta → scegli CSV o Excel. ' +
      'Quegli formati funzionano sempre al 100%.'
    )
  }

  const headers = ['Data', 'Descrizione', 'Importo']
  const suggested = suggestColumns(headers, rows)
  const parsed = applyColumnMap(rows, suggested)

  return {
    headers,
    rows,
    suggested,
    parsed,
    fileName: file.name,
    totalRows: rows.length,
    warnings: ['Il parsing PDF è sperimentale. Verifica le transazioni prima di importare.'],
  }
}

// ─── Entrypoint unificato ────────────────────────────────────────────────────

export async function parseFile(file: File): Promise<ImportPreviewResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'csv' || file.type === 'text/csv') return parseCSV(file)
  if (ext === 'xlsx' || ext === 'xls') return parseExcel(file)
  if (ext === 'pdf' || file.type === 'application/pdf') return parsePDF(file)
  throw new Error(`Formato non supportato: .${ext}. Usa CSV, Excel (.xlsx) o PDF.`)
}

// ─── Auto-categorizzazione per descrizione ───────────────────────────────────
// Copre descrizioni italiane, inglesi (Revolut, N26, Wise) e miste

type CatHint = { keywords: string[]; type: 'INCOME' | 'EXPENSES' | 'SAVINGS'; hint: string }

const CATEGORY_HINTS: CatHint[] = [

  // ── ENTRATE ────────────────────────────────────────────────────────────────
  {
    keywords: ['stipendio', 'salary', 'salario', 'retribuz', 'accredito stipendio', 'payroll',
               'mensilità', 'busta paga', 'emolumenti'],
    type: 'INCOME', hint: 'Stipendio',
  },
  {
    keywords: ['accredito bonifico', 'incoming transfer', 'received transfer', 'bonifico in arrivo',
               'accredito da', 'transfer from', 'money received', 'top-up', 'topup',
               'accredito bonifico estero', 'foreign transfer'],
    type: 'INCOME', hint: 'Entrate',
  },
  {
    keywords: ['rimborso', 'refund', 'restituzione', 'cashback', 'cash back', 'rebate',
               'storno', 'reversal', 'chargeback'],
    type: 'INCOME', hint: 'Rimborsi',
  },
  {
    keywords: ['affitto incassato', 'canone ricevuto', 'locazione attiva', 'rent received'],
    type: 'INCOME', hint: 'Rendite & Affitti',
  },
  {
    keywords: ['dividendo', 'dividend', 'interesse attivo', 'interest earned', 'cedola',
               'coupon', 'rendimento'],
    type: 'INCOME', hint: 'Interessi & Dividendi',
  },
  {
    keywords: ['bonus', 'premio', 'incentivo', 'gratifica', 'tredicesima', 'quattordicesima'],
    type: 'INCOME', hint: 'Bonus & Premi',
  },

  // ── SPESA ALIMENTARE ───────────────────────────────────────────────────────
  {
    keywords: ['supermercato', 'esselunga', 'conad', 'coop ', 'lidl', 'pam ', 'carrefour',
               'iper', 'eurospin', 'penny', 'bennet', 'aldi', 'tigros', 'simply',
               'gigante', 'unes', 'famila', 'despar', 'spar ', 'grocery', 'supermarket',
               'alimentari', 'macelleria', 'pescheria', 'fruttivendolo', 'ortofrutta',
               'mercato', 'market ', 'frutta e verdura'],
    type: 'EXPENSES', hint: 'Spesa alimentare',
  },

  // ── RISTORANTI & BAR ───────────────────────────────────────────────────────
  {
    keywords: ['ristorante', 'restaurant', 'pizzeria', 'pizza ', 'bar ', 'café', 'caffe ',
               'trattoria', 'osteria', 'sushi', 'mcdonald', 'burger king', 'kfc ', 'subway ',
               'kebab', 'poke', 'gelateria', 'pasticceria', 'bakery', 'bistrot', 'pub ',
               'taverna', 'braceria', 'steakhouse', 'just eat', 'deliveroo', 'glovo',
               'uber eats', 'food delivery', 'takeaway'],
    type: 'EXPENSES', hint: 'Ristoranti & Bar',
  },

  // ── ABBONAMENTI & STREAMING ────────────────────────────────────────────────
  {
    keywords: ['netflix', 'spotify', 'amazon prime', 'disney', 'youtube premium', 'youtube music',
               'apple tv', 'apple music', 'apple one', 'hbo', 'paramount', 'dazn', 'sky ',
               'now tv', 'mediaset', 'rai play', 'crunchyroll', 'twitch', 'adobe', 'canva',
               'figma', 'notion', 'dropbox', 'icloud', 'google one', 'google storage',
               'microsoft 365', 'office 365', 'chatgpt', 'openai', 'claude', 'anthropic',
               'subscription', 'abbonamento', 'monthly fee', 'annual fee'],
    type: 'EXPENSES', hint: 'Abbonamenti & Streaming',
  },

  // ── UTENZE ─────────────────────────────────────────────────────────────────
  {
    keywords: ['enel', 'a2a ', 'hera ', 'iren ', 'eni gas', 'snam', 'italgas',
               'luce e gas', 'bolletta', 'utenza', 'energia', 'electricity', 'gas bill',
               'water bill', 'acqua ', 'acea ', 'cap ', 'tim ', 'vodafone', 'wind ',
               'fastweb', 'iliad', 'telecom', 'telefonia', 'internet casa', 'fibra',
               'adsl', 'phone bill'],
    type: 'EXPENSES', hint: 'Utenze',
  },

  // ── ABITAZIONE ─────────────────────────────────────────────────────────────
  {
    keywords: ['affitto', 'locazione', 'canone affitto', 'rent ', 'landlord', 'proprietario',
               'condominio', 'spese condominiali', 'amministratore', 'portiere'],
    type: 'EXPENSES', hint: 'Abitazione',
  },
  {
    keywords: ['mutuo', 'rata mutuo', 'mortgage', 'mortgage payment'],
    type: 'EXPENSES', hint: 'Mutuo casa',
  },

  // ── TRASPORTI & AUTO ───────────────────────────────────────────────────────
  {
    keywords: ['carburante', 'benzina', 'diesel', 'gasolio', 'q8 ', 'agip', 'ip stazione',
               'esso ', 'shell ', 'total ', 'api ', 'fuel', 'petrol', 'rifornimento'],
    type: 'EXPENSES', hint: 'Auto & Carburante',
  },
  {
    keywords: ['trenitalia', 'italo ', 'frecciarossa', 'frecciargento', 'intercity',
               'biglietto treno', 'tram', 'metro ', 'atm ', 'atac', 'gtt ', 'amt ',
               'bus ', 'autobus', 'flixbus', 'blablacar', 'train ticket', 'rail',
               'abbonamento trasporti', 'mensile metro'],
    type: 'EXPENSES', hint: 'Trasporti',
  },
  {
    keywords: ['uber', 'lyft', 'taxi', 'cab ', 'mytaxi', 'itaxi', 'radiotaxi', 'ncc '],
    type: 'EXPENSES', hint: 'Trasporti',
  },
  {
    keywords: ['ryanair', 'easyjet', 'alitalia', 'ita airways', 'vueling', 'lufthansa',
               'wizz', 'volotea', 'aeroporto', 'airport', 'flight', 'volo ', 'airline'],
    type: 'EXPENSES', hint: 'Trasporti',
  },
  {
    keywords: ['parcheggio', 'parking', 'garage', 'autosilo', 'ztl', 'telepass', 'autostrada',
               'pedaggi', 'toll'],
    type: 'EXPENSES', hint: 'Auto & Carburante',
  },

  // ── SALUTE ─────────────────────────────────────────────────────────────────
  {
    keywords: ['farmacia', 'farmac', 'parafarmacia', 'pharmacy', 'drugstore',
               'medico', 'dottore', 'visita medica', 'specialista', 'ambulatorio',
               'ospedale', 'hospital', 'clinica', 'laboratorio analisi', 'dentista',
               'oculista', 'fisioterapia', 'psicologo', 'nutrizionista', 'veterinario'],
    type: 'EXPENSES', hint: 'Salute',
  },

  // ── PALESTRA & SPORT ───────────────────────────────────────────────────────
  {
    keywords: ['palestra', 'gym', 'fitness', 'wellness', 'piscina', 'tennis',
               'padel', 'calcetto', 'crossfit', 'pilates', 'yoga', 'sport'],
    type: 'EXPENSES', hint: 'Salute',
  },

  // ── SHOPPING ───────────────────────────────────────────────────────────────
  {
    keywords: ['amazon', 'zalando', 'h&m ', 'zara ', 'shein', 'asos', 'uniqlo',
               'primark', 'ikea', 'leroy merlin', 'brico', 'decathlon', 'bricocenter',
               'mediaworld', 'euronics', 'unieuro', 'apple store', 'fnac',
               'abbigliamento', 'scarpe', 'fashion', 'clothing', 'shopping'],
    type: 'EXPENSES', hint: 'Shopping',
  },

  // ── FORMAZIONE ─────────────────────────────────────────────────────────────
  {
    keywords: ['udemy', 'coursera', 'skillshare', 'masterclass', 'linkedin learning',
               'corso ', 'formazione', 'workshop', 'webinar', 'university', 'università',
               'libri', 'amazon books', 'kindle', 'feltrinelli', 'mondadori', 'ibs '],
    type: 'EXPENSES', hint: 'Formazione',
  },

  // ── COMMISSIONI / FEES ─────────────────────────────────────────────────────
  {
    keywords: ['commissione', 'commission', 'fee ', 'fees', 'tasso di cambio',
               'exchange fee', 'currency exchange', 'fx fee', 'interchange',
               'spese bancarie', 'canone conto', 'account fee', 'service charge',
               'pagamento carta', 'card payment fee', 'international fee'],
    type: 'EXPENSES', hint: 'Spesa alimentare', // fallback generico
  },

  // ── PRELIEVI ───────────────────────────────────────────────────────────────
  {
    keywords: ['prelievo', 'atm withdrawal', 'cash withdrawal', 'bancomat', 'prelevamento',
               'ritiro contanti', 'sportello'],
    type: 'EXPENSES', hint: 'Spesa alimentare', // mappato a spesa generica
  },

  // ── RISPARMI ───────────────────────────────────────────────────────────────
  {
    keywords: ['trasferimento a risparmio', 'move to savings', 'savings transfer',
               'fondo emergenza', 'accantonamento'],
    type: 'SAVINGS', hint: 'Fondo emergenza',
  },
]

/**
 * Suggerisce categoria e tipo in base alla descrizione della transazione.
 * Restituisce il tipo e il nome parziale della categoria da cercare nel DB.
 */
export function suggestCategory(description: string): { type: 'INCOME' | 'EXPENSES' | 'SAVINGS'; hint: string } | null {
  if (!description) return null
  const d = description.toLowerCase()
  for (const { keywords, type, hint } of CATEGORY_HINTS) {
    if (keywords.some((k) => d.includes(k.toLowerCase()))) return { type, hint }
  }
  return null
}
