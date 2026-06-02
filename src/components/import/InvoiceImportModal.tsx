/**
 * Importazione fatture con AI (Claude Vision).
 *
 * Flusso:
 * 1. Upload file (PDF, immagine, CSV/Excel di fatture)
 * 2. AI estrae: cliente, data, importo lordo, IVA, stato
 * 3. Anteprima + correzione manuale
 * 4. Import in Supabase
 *
 * Per le immagini/PDF usa Claude Vision via un edge function Supabase
 * (o direttamente l'API Anthropic se configurata lato client).
 * Per CSV/Excel usa il parsing locale.
 */

import { useState, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { calcNetto } from '@/lib/nettometro'
import { formatCurrency } from '@/lib/formatters'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import {
  Upload, X, CheckCircle2, AlertTriangle, RefreshCw,
  Sparkles, FileText, FileSpreadsheet, FileScan,
  Pencil, ChevronRight, Info,
} from 'lucide-react'
import type { InvoiceStatus } from '@/lib/database.types'

// ─── Struttura fattura estratta ───────────────────────────────────────────────

interface ExtractedInvoice {
  client_name: string
  date_issued: string
  amount_gross: number
  status: InvoiceStatus
  due_date: string
  activity_name: string
  rawText?: string         // testo grezzo da AI (per debug)
  confidence: 'high' | 'medium' | 'low'
  source: 'ai' | 'csv' | 'manual'
}

type Step = 'upload' | 'map' | 'preview' | 'done'

interface InvoiceColMap {
  client:   string
  date:     string
  amount:   string
  status:   string
  dueDate:  string
  note:     string
}

interface Props {
  onClose: () => void
}

// ─── Parsing CSV/Excel fatture ────────────────────────────────────────────────

/** Nomi mesi italiani + inglesi — usati per scartare righe-intestazione */
const MONTH_LABELS = new Set([
  'gennaio','febbraio','marzo','aprile','maggio','giugno',
  'luglio','agosto','settembre','ottobre','novembre','dicembre',
  'january','february','march','april','may','june',
  'july','august','september','october','november','december',
])

/** Etichette sezione da scartare */
const SECTION_LABELS = new Set([
  'fatture emesse','fatture ricevute','fatture','totale','subtotale',
  'riepilogo','note di credito','proforma','ricevute',
  'invoices','total','summary',
])

function isLabelRow(row: Record<string, string>): boolean {
  const vals = Object.values(row).map((v) => v.toLowerCase().trim()).filter(Boolean)
  if (vals.length === 0) return true
  const first = vals[0]
  if (MONTH_LABELS.has(first)) return true
  if (SECTION_LABELS.has(first)) return true
  if (first.startsWith('#') && vals.length <= 2) return true
  // Riga con un solo valore non numerico
  if (vals.filter(Boolean).length === 1 && isNaN(parseFloat(vals[0]))) return true
  return false
}

/** Trova la miglior colonna in base a pattern */
function findCol(headers: string[], patterns: RegExp): string {
  return headers.find((h) => patterns.test(h)) ?? ''
}

function parseInvoiceAmount(raw: string): number {
  if (!raw) return 0
  let s = raw.trim()
  // Rimuovi simboli valuta, codici ISO (EUR, USD, CHF...) e spazi
  // SheetJS con raw:false formatta i numeri con il codice valuta del file
  // es. "EUR 1.130,00" → bisogna strippare le lettere prima di parsare
  s = s.replace(/[€$£¥₹]/g, '').replace(/[A-Za-z]/g, '').replace(/\s+/g, '')
  if (!s) return 0
  const neg = s.startsWith('-')
  s = s.replace(/^[+-]/, '')
  // Formato IT: 1.234,56 (virgola = decimale, punto = migliaia)
  if (s.includes(',') && s.includes('.') && s.lastIndexOf(',') > s.lastIndexOf('.')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',') && !s.includes('.')) {
    s = s.replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }
  const n = parseFloat(s)
  if (isNaN(n)) return 0
  return neg ? -n : n
}

function normalizeDate(raw: unknown): string {
  if (!raw) return ''
  // SheetJS con cellDates:true restituisce oggetti Date
  if (raw instanceof Date) {
    if (!isNaN(raw.getTime())) return raw.toISOString().slice(0, 10)
    return ''
  }
  const s = String(raw).trim()
  if (!s) return ''
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // DD/MM/YYYY o DD-MM-YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`
  // DD/MM/YY
  const m2 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/)
  if (m2) return `20${m2[3]}-${m2[2].padStart(2,'0')}-${m2[1].padStart(2,'0')}`
  // Excel serial number (es. 46174 = 2026-05-30)
  if (/^\d{5}$/.test(s)) {
    const d = new Date((parseInt(s) - 25569) * 86400 * 1000)
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return ''
}

function mapStatus(raw: string): InvoiceStatus {
  const s = raw.toLowerCase().trim()
  // Fatture in Cloud: "SI" = saldato = pagato
  if (s === 'si' || /pag|paid|saldat/.test(s)) return 'PAID'
  if (/scad|overdue|scadut/.test(s)) return 'OVERDUE'
  return 'PENDING'
}

function parseInvoiceRows(rows: Record<string, string>[]): ExtractedInvoice[] {
  if (rows.length === 0) return []
  const headers = Object.keys(rows[0])

  // ── Rileva colonne UNA VOLTA per tutte le righe ──────────────────────────
  const clientCol  = findCol(headers, /cliente|client|ragione|intestat|denominaz|nome.client|customer/i)
  const dateCol    = findCol(headers, /data.emiss|data.fatt|date.issu|invoice.date|data$/i)
                  || findCol(headers, /data|date/i)
  const amountCol  = findCol(headers, /importo.lordo|totale.lordo|imponibile|gross|total.amount|totale.fatt/i)
                  || findCol(headers, /importo|totale|amount|total/i)
  const statusCol  = findCol(headers, /stato|status|pagament|payment/i)
  const dueDateCol = findCol(headers, /scadenza|due.date|data.scad/i)
  const numCol     = findCol(headers, /numero|num\.?fatt|invoice.num|n\.\s*fatt/i)
  const noteCol    = findCol(headers, /note|descrizione|oggetto|servizio|voce/i)

  const confidence: 'high' | 'medium' | 'low' =
    clientCol && amountCol && dateCol ? 'high' :
    (clientCol || amountCol) ? 'medium' : 'low'

  return rows
    .filter((row) => !isLabelRow(row))
    .map((row) => {
      const client  = (row[clientCol] ?? '').trim()
      const rawDate = (row[dateCol]   ?? '').trim()
      const rawAmt  = (row[amountCol] ?? '').trim()
      const amount  = parseInvoiceAmount(rawAmt)
      const date    = normalizeDate(rawDate)
      const status  = mapStatus(row[statusCol] ?? '')
      const dueDate = normalizeDate(row[dueDateCol] ?? '')
      const note    = (row[noteCol]   ?? row[numCol] ?? '').trim()

      return {
        client_name:   client,
        date_issued:   date,
        amount_gross:  amount,
        status,
        due_date:      dueDate,
        activity_name: note,
        confidence,
        source:        'csv' as const,
      }
    })
    // Scarta righe prive di dati utili
    .filter((inv) => {
      const hasClient = inv.client_name.length > 1
      const hasAmount = inv.amount_gross > 0
      const hasDate   = inv.date_issued.length > 0
      // Almeno due dei tre campi principali devono essere presenti
      return [hasClient, hasAmount, hasDate].filter(Boolean).length >= 2
    })
}

/** Suggerisce le colonne da una lista di header */
function detectColMap(headers: string[]): InvoiceColMap {
  const f = (patterns: RegExp) => headers.find((h) => patterns.test(h)) ?? ''
  return {
    client:  f(/cliente|client|ragione|intestat|denominaz|nome.client|customer/i),
    date:    f(/data.emiss|data.fatt|date.issu|invoice.date/i) || f(/^data$/i),
    // "Lordo" = totale FiC (importo netto + eventuali addizionali); "Imponibile" come fallback
    amount:  f(/importo.lordo|totale.lordo|gross|total.amount|totale.fatt/i) || f(/^lordo$/i) || f(/imponibile/i) || f(/importo|totale|amount|total/i),
    // "Saldato" = colonna SI/NO di Fatture in Cloud
    status:  f(/saldato/i) || f(/stato|status|pagament|payment/i),
    // "Prox scadenza" di FiC
    dueDate: f(/prox.scad|pross.scad|scadenza|due.date|data.scad/i),
    note:    f(/numero|num\.?fatt|invoice.num|n\.\s*fatt|note|oggetto/i),
  }
}

/** Applica una InvoiceColMap manuale alle righe grezze */
function applyInvoiceColMap(rows: Record<string, string>[], map: InvoiceColMap): ExtractedInvoice[] {
  return rows
    .filter((row) => !isLabelRow(row))
    .map((row) => {
      const client  = (row[map.client]  ?? '').trim()
      const rawDate = (row[map.date]    ?? '').trim()
      const rawAmt  = (row[map.amount]  ?? '').trim()
      const amount  = parseInvoiceAmount(rawAmt)
      const date    = normalizeDate(rawDate)
      const status  = mapStatus(row[map.status]  ?? '')
      const dueDate = normalizeDate(row[map.dueDate] ?? '')
      const note    = (row[map.note] ?? '').trim()
      return {
        client_name:   client,
        date_issued:   date,
        amount_gross:  amount,
        status,
        due_date:      dueDate,
        activity_name: note,
        confidence:    (client && amount > 0 && date ? 'high' : 'medium') as 'high'|'medium'|'low',
        source:        'csv' as const,
      }
    })
    .filter((inv) => {
      return [inv.client_name.length > 1, inv.amount_gross > 0, inv.date_issued.length > 0]
        .filter(Boolean).length >= 2
    })
}

function parseInvoiceCSV(text: string): { rows: Record<string, string>[]; headers: string[]; suggested: InvoiceColMap } {
  const attempt1 = Papa.parse<Record<string, string>>(text, {
    header: true, skipEmptyLines: true, transformHeader: (h) => h.trim(),
  })
  let rows = attempt1.data as Record<string, string>[]
  let headers = attempt1.meta.fields ?? []

  // Se non trova colonne utili, prova saltando le prime righe non-dati
  if (parseInvoiceRows(rows).length === 0) {
    const lines = text.split('\n').filter((l) => l.trim())
    const headerIdx = lines.findIndex((l) =>
      /data|date|cliente|client|importo|amount|totale/i.test(l)
    )
    if (headerIdx > 0) {
      const trimmed = lines.slice(headerIdx).join('\n')
      const attempt2 = Papa.parse<Record<string, string>>(trimmed, {
        header: true, skipEmptyLines: true, transformHeader: (h) => h.trim(),
      })
      rows = attempt2.data as Record<string, string>[]
      headers = attempt2.meta.fields ?? []
    }
  }

  return { rows, headers, suggested: detectColMap(headers) }
}

// ─── AI extraction via Supabase Edge Function ─────────────────────────────────

interface AIUsage { used: number; limit: number; remaining: number }

async function extractWithAI(file: File): Promise<{ invoices: ExtractedInvoice[]; usage: AIUsage }> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  const base64 = btoa(binary)

  const mediaType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')

  const { data, error } = await supabase.functions.invoke('extract-invoice', {
    body: { base64, mediaType, fileName: file.name },
  })

  if (error) throw new Error(`Errore AI: ${error.message}`)
  if (data?.limitReached) throw new Error(data.error)

  const invoices = (data?.invoices ?? []).map((inv: Partial<ExtractedInvoice>) => ({
    client_name:   inv.client_name   ?? '',
    date_issued:   inv.date_issued   ?? new Date().toISOString().slice(0,10),
    amount_gross:  inv.amount_gross  ?? 0,
    status:        inv.status        ?? 'PENDING',
    due_date:      inv.due_date      ?? '',
    activity_name: inv.activity_name ?? '',
    rawText:       inv.rawText,
    confidence:    (inv.confidence   ?? 'medium') as 'high' | 'medium' | 'low',
    source:        'ai' as const,
  }))

  return { invoices, usage: data?.usage ?? { used: 1, limit: 10, remaining: 9 } }
}

// ─── Componente principale ────────────────────────────────────────────────────

export function InvoiceImportModal({ onClose }: Props) {
  const { profile } = useAppStore()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<ExtractedInvoice[]>([])
  const [aiUsage, setAiUsage] = useState<AIUsage | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [importedCount, setImportedCount] = useState(0)
  // Stato per il mapping CSV
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [colMap, setColMap] = useState<InvoiceColMap>({ client:'', date:'', amount:'', status:'', dueDate:'', note:'' })

  const currency = profile?.currency ?? 'EUR'

  // ─── Gestione file ─────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setLoading(true)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

    try {
      let extracted: ExtractedInvoice[] = []

      if (ext === 'csv') {
        setLoadingMsg('Analisi CSV...')
        const text = await file.text()
        const { rows, headers, suggested } = parseInvoiceCSV(text)
        setRawRows(rows)
        setCsvHeaders(headers)
        setColMap(suggested)
        // Vai allo step di mapping se ha header rilevati
        if (headers.length > 0) {
          setStep('map')
          return
        }
        extracted = parseInvoiceRows(rows)
      } else if (ext === 'xlsx' || ext === 'xls') {
        setLoadingMsg('Analisi Excel...')
        const buf = await file.arrayBuffer()

        // ── Lettura robusta: 3 tentativi in cascata ────────────────────────────
        // I file .xls di Fatture in Cloud hanno un compound document leggermente
        // corrotto che fa fallire la lettura standard di SheetJS.
        let wb: ReturnType<typeof XLSX.read> | null = null
        const readAttempts = [
          () => XLSX.read(buf, { type: 'array', cellDates: true, WTF: false }),
          () => XLSX.read(buf, { type: 'array', cellDates: false, WTF: false, dense: true }),
          () => {
            // Fallback binario — converte il buffer in stringa binaria
            const u8 = new Uint8Array(buf)
            let bin = ''
            for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i])
            return XLSX.read(bin, { type: 'binary', cellDates: true, WTF: false })
          },
        ]
        for (const attempt of readAttempts) {
          try { wb = attempt(); break } catch { /* prossimo tentativo */ }
        }

        // ── Fallback AI se tutti i tentativi falliscono ────────────────────────
        if (!wb || !wb.SheetNames.length) {
          setLoadingMsg('Excel non leggibile — analisi AI in corso… (Claude estrae i dati)')
          const result = await extractWithAI(file)
          extracted = result.invoices
          setAiUsage(result.usage)
          if (extracted.length === 0) throw new Error(
            'Impossibile leggere il file Excel né con il parser standard né con l\'AI.\n\n' +
            'Soluzione: apri il file in Excel o Google Sheets → File → Scarica come .xlsx → ricarica il file .xlsx convertito.'
          )
          setInvoices(extracted)
          setSelected(new Set(extracted.map((_, i) => i)))
          setStep('preview')
          return
        }

        const ws = wb.Sheets[wb.SheetNames[0]]
        // raw: true → numeri come numeri puri (es. 1130, non "EUR 1.130,00")
        // Le date Excel seriali (es. 46174) vengono gestite da normalizeDate
        const rawArrays = XLSX.utils.sheet_to_json<string[]>(ws, {
          header: 1, raw: true, defval: '',
        })

        // Prima riga con ≥4 celle non vuote che contiene keyword di colonne fattura
        const headerRowIdx = rawArrays.findIndex((row) =>
          (row as string[]).filter(Boolean).length >= 4 &&
          (row as string[]).some((cell) =>
            /data|cliente|client|importo|lordo|imponibile|numero|saldato|stato/i.test(String(cell))
          )
        )

        if (headerRowIdx === -1) {
          throw new Error(
            'Intestazione non trovata nel file Excel.\n\n' +
            'Assicurati che il file contenga colonne come "Data", "Cliente", "Importo" o "Lordo".\n' +
            'Se è un export di Fatture in Cloud, il formato è supportato automaticamente.'
          )
        }

        const headers = (rawArrays[headerRowIdx] as unknown[]).map((h) => String(h ?? '').trim()).filter(Boolean)
        const raw = rawArrays.slice(headerRowIdx + 1).map((row) => {
          const obj: Record<string, string> = {}
          headers.forEach((h, i) => {
            const val = (row as unknown[])[i] ?? ''
            // SheetJS con cellDates:true restituisce Date objects per le celle data.
            // String(Date) produrrebbe "Mon May 30 2026..." che normalizeDate non riconosce.
            if (val instanceof Date) {
              obj[h] = isNaN(val.getTime()) ? '' : val.toISOString().slice(0, 10)
            } else {
              obj[h] = String(val).trim()
            }
          })
          return obj
        }).filter((r) => Object.values(r).some((v) => v))

        setRawRows(raw)
        setCsvHeaders(headers)
        setColMap(detectColMap(headers))
        setStep('map')
        return
      } else if (ext === 'pdf' || file.type.startsWith('image/')) {
        setLoadingMsg('Analisi AI in corso… (Claude sta leggendo la fattura)')
        const result = await extractWithAI(file)
        extracted = result.invoices
        setAiUsage(result.usage)
      } else {
        throw new Error(`Formato non supportato: .${ext}. Usa PDF, immagine, CSV o Excel.`)
      }

      if (extracted.length === 0) {
        throw new Error(
          'Nessuna fattura valida trovata nel file.\n\n' +
          'Il file deve avere almeno due di questi campi per ogni riga: ' +
          'nome cliente, importo, data.\n\n' +
          'Formati supportati: Fatture in Cloud CSV, Aruba, Danea, o qualsiasi CSV con colonne cliente/importo/data.'
        )
      }

      setInvoices(extracted)
      setSelected(new Set(extracted.map((_, i) => i)))
      setStep('preview')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Errore durante l\'analisi.')
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }, [])

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) handleFile(f)
  }
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }, [handleFile])

  const applyColMap = () => {
    const extracted = applyInvoiceColMap(rawRows, colMap)
    if (extracted.length === 0) {
      setError('Nessuna fattura valida con le colonne selezionate. Prova a cambiare il mapping.')
      return
    }
    setError(null)
    setInvoices(extracted)
    setSelected(new Set(extracted.map((_, i) => i)))
    setStep('preview')
  }

  // ─── Import in DB ──────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!profile) return
    setLoading(true)
    setLoadingMsg('Salvataggio fatture...')

    const toInsert = invoices
      .filter((_, i) => selected.has(i))
      .map((inv) => {
        const netto = calcNetto(inv.amount_gross, profile.tax_regime, profile.ateco_coefficient, profile.inps_regime ?? 'GESTIONE_SEPARATA', profile.inps_reduction_pct ?? 0)
        return {
          user_id:       profile.id,
          date_issued:   inv.date_issued || new Date().toISOString().slice(0,10),
          client_name:   inv.client_name || 'Cliente sconosciuto',
          amount_gross:  inv.amount_gross,
          amount_net:    netto.netAmount,
          tax_amount:    netto.taxes,
          inps_amount:   netto.inps,
          status:        inv.status,
          due_date:      inv.due_date || inv.date_issued || new Date().toISOString().slice(0,10),
          activity_name: inv.activity_name || null,
          fic_id:        null,
        }
      })

    let inserted = 0
    const CHUNK = 20
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const { error, data } = await supabase.from('invoices').insert(toInsert.slice(i, i + CHUNK)).select('id')
      if (error) {
        setError(`Errore Supabase: ${error.message}`)
        setLoading(false)
        setLoadingMsg('')
        return
      }
      inserted += data?.length ?? 0
    }

    await qc.invalidateQueries({ queryKey: ['invoices'] })
    await qc.refetchQueries({ queryKey: ['invoices'] })
    setImportedCount(inserted)
    setLoading(false)
    setLoadingMsg('')
    setStep('done')
  }

  // ─── UI helpers ────────────────────────────────────────────────────────────

  const toggleRow = (i: number) => setSelected((prev) => {
    const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next
  })

  const updateInvoice = (i: number, patch: Partial<ExtractedInvoice>) => {
    setInvoices((prev) => prev.map((inv, idx) => idx === i ? { ...inv, ...patch } : inv))
  }

  const confidenceBadge = (c: ExtractedInvoice['confidence']) => ({
    high:   { label: 'Alta',   cls: 'bg-emerald-100 text-emerald-700' },
    medium: { label: 'Media',  cls: 'bg-amber-100 text-amber-700' },
    low:    { label: 'Bassa',  cls: 'bg-rose-100 text-rose-700' },
  }[c])

  const STATUS_OPTS: { value: InvoiceStatus; label: string }[] = [
    { value: 'PAID',    label: 'Pagata' },
    { value: 'PENDING', label: 'In attesa' },
    { value: 'OVERDUE', label: 'Scaduta' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Sparkles size={16} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Importa fatture con AI</h2>
              <p className="text-xs text-gray-400 mt-0.5">PDF, immagine, CSV o Excel — Claude estrae i dati automaticamente</p>
            </div>
          </div>

          {/* Badge utilizzo AI */}
          {aiUsage && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium ${
              aiUsage.remaining <= 2
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : aiUsage.remaining <= 5
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
              <Sparkles size={11} />
              {aiUsage.used}/{aiUsage.limit} estrazioni AI usate questo mese
              {aiUsage.remaining <= 2 && ' — quasi esaurite!'}
            </div>
          )}
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── STEP 1: Upload ─────────────────────────────────────────────── */}
          {step === 'upload' && (
            <div className="p-6 space-y-5">
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                  dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                }`}
              >
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.csv,.xlsx,.xls" className="hidden" onChange={onFileInput} />
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                      <Sparkles size={22} className="text-indigo-500 animate-pulse" />
                    </div>
                    <p className="text-sm font-medium text-gray-700">{loadingMsg || 'Analisi in corso…'}</p>
                    <p className="text-xs text-gray-400">Claude sta leggendo il documento</p>
                  </div>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center mx-auto mb-4">
                      <Upload size={26} className="text-indigo-500" strokeWidth={1.5} />
                    </div>
                    <p className="font-semibold text-gray-700 mb-1">Trascina la fattura qui o clicca per selezionarla</p>
                    <p className="text-xs text-gray-400">PDF, JPG/PNG, CSV, Excel</p>
                  </>
                )}
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3">
                  <AlertTriangle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-700">{error}</p>
                </div>
              )}

              {/* Come funziona l'AI */}
              <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={14} className="text-indigo-500" />
                  <p className="text-sm font-bold text-indigo-800">Come funziona l'AI</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { step: '1', icon: Upload,       label: 'Carica', desc: 'Trascina PDF o foto della fattura' },
                    { step: '2', icon: Sparkles,     label: 'Claude analizza', desc: 'Estrae cliente, data, importo, IVA' },
                    { step: '3', icon: CheckCircle2, label: 'Importa', desc: 'Verifica e salva in un click' },
                  ].map(({ step: s, icon: Icon, label, desc }) => (
                    <div key={s} className="text-center">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-2">
                        <Icon size={14} className="text-indigo-600" />
                      </div>
                      <p className="text-xs font-semibold text-indigo-800">{label}</p>
                      <p className="text-xs text-indigo-600 mt-0.5">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Formati supportati */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { Icon: FileScan,       label: 'PDF',         desc: 'Fattura PDF',           color: '#f59e0b', ai: true },
                  { Icon: FileText,       label: 'JPG/PNG',     desc: 'Foto fattura',           color: '#6366f1', ai: true },
                  { Icon: FileSpreadsheet,label: 'CSV',         desc: 'Lista fatture',          color: '#10b981', ai: false },
                  { Icon: FileSpreadsheet,label: 'Excel',       desc: 'Registro fatture',       color: '#0ea5e9', ai: false },
                ].map(({ Icon, label, desc, color, ai }) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <Icon size={18} className="mx-auto mb-1.5" style={{ color }} />
                    <p className="text-xs font-bold text-gray-700">{label}</p>
                    <p className="text-xs text-gray-400">{desc}</p>
                    {ai && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-indigo-500 font-medium mt-1">
                        <Sparkles size={9} /> AI
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Nota AI */}
              <div className="flex gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
                <Info size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  L'estrazione AI richiede la <strong>Supabase Edge Function <code>extract-invoice</code></strong> configurata con la tua API key Anthropic.
                  Per CSV/Excel l'analisi è locale e non richiede AI.
                </p>
              </div>
            </div>
          )}

          {/* ── STEP MAP: Mappa colonne CSV ────────────────────────────────── */}
          {step === 'map' && (
            <div className="p-6 space-y-5">
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex gap-2">
                <Info size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-700">
                  BudgetFlow ha rilevato le colonne automaticamente. Verifica che siano corrette — soprattutto <strong>Cliente</strong> e <strong>Importo</strong>.
                  <br />File: <strong>{csvHeaders.length} colonne</strong>, <strong>{rawRows.length} righe</strong>.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {([
                  { key: 'client',  label: 'Cliente *',          required: true  },
                  { key: 'date',    label: 'Data emissione *',    required: true  },
                  { key: 'amount',  label: 'Importo lordo *',     required: true  },
                  { key: 'status',  label: 'Stato pagamento',     required: false },
                  { key: 'dueDate', label: 'Scadenza',            required: false },
                  { key: 'note',    label: 'N° fattura / Nota',   required: false },
                ] as { key: keyof InvoiceColMap; label: string; required: boolean }[]).map(({ key, label, required }) => {
                  const val = rawRows[0]?.[colMap[key]] ?? ''
                  const isAmount = key === 'amount'
                  const parsed = isAmount ? parseInvoiceAmount(val) : null
                  const badAmount = isAmount && val && parsed === 0

                  return (
                    <div key={key}>
                      <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">
                        {label}
                      </label>
                      <select
                        value={colMap[key]}
                        onChange={(e) => setColMap({ ...colMap, [key]: e.target.value })}
                        className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                          required && !colMap[key] ? 'border-rose-300 bg-rose-50' : 'border-gray-200'
                        }`}
                      >
                        <option value="">— non presente —</option>
                        {csvHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>

                      {/* Preview valore */}
                      <div className={`mt-1.5 rounded-lg px-2.5 py-1.5 text-xs font-mono flex items-center gap-2 ${
                        badAmount ? 'bg-rose-50 border border-rose-200' : 'bg-gray-50'
                      }`}>
                        <span className="text-gray-400">Anteprima:</span>
                        <span className="text-gray-700 truncate">{val || '—'}</span>
                        {isAmount && val && (
                          <>
                            <span className="text-gray-300">→</span>
                            <span className={`font-bold ${badAmount ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {badAmount ? '⚠️ 0 — cambia colonna' : `€ ${parsed}`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex gap-2">
                  <AlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-700">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Anteprima ──────────────────────────────────────────── */}
          {step === 'preview' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-700">{invoices.length} fatture estratte</p>
                  <p className="text-xs text-gray-400 mt-0.5">Verifica i dati prima di importare. Puoi modificare ogni campo.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSelected(new Set(invoices.map((_, i) => i)))} className="text-xs text-indigo-600 hover:underline">Seleziona tutto</button>
                  <span className="text-gray-300">·</span>
                  <button onClick={() => setSelected(new Set())} className="text-xs text-gray-400 hover:underline">Deseleziona</button>
                </div>
              </div>

              <div className="space-y-3">
                {invoices.map((inv, i) => {
                  const isSelected = selected.has(i)
                  const isEditing = editIdx === i
                  const conf = confidenceBadge(inv.confidence)
                  const netto = profile ? calcNetto(inv.amount_gross, profile.tax_regime, profile.ateco_coefficient, profile.inps_regime ?? 'GESTIONE_SEPARATA', profile.inps_reduction_pct ?? 0) : null

                  return (
                    <div
                      key={i}
                      className={`rounded-2xl border-2 transition-all ${
                        isSelected ? 'border-indigo-200 bg-white shadow-sm' : 'border-gray-100 bg-gray-50 opacity-60'
                      }`}
                    >
                      {/* Row header */}
                      <div className="flex items-start gap-3 p-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(i)}
                          className="accent-indigo-500 w-4 h-4 mt-1 shrink-0"
                        />

                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            /* ─ Modalità modifica ─ */
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Cliente</label>
                                <input
                                  value={inv.client_name}
                                  onChange={(e) => updateInvoice(i, { client_name: e.target.value })}
                                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Data emissione</label>
                                <input
                                  type="date"
                                  value={inv.date_issued}
                                  onChange={(e) => updateInvoice(i, { date_issued: e.target.value })}
                                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Importo lordo (€)</label>
                                <input
                                  type="number"
                                  value={inv.amount_gross}
                                  onChange={(e) => updateInvoice(i, { amount_gross: +e.target.value })}
                                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Stato</label>
                                <select
                                  value={inv.status}
                                  onChange={(e) => updateInvoice(i, { status: e.target.value as InvoiceStatus })}
                                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                >
                                  {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Scadenza</label>
                                <input
                                  type="date"
                                  value={inv.due_date}
                                  onChange={(e) => updateInvoice(i, { due_date: e.target.value })}
                                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Attività / progetto</label>
                                <input
                                  value={inv.activity_name}
                                  onChange={(e) => updateInvoice(i, { activity_name: e.target.value })}
                                  placeholder="Es. Progetto Alpha"
                                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                              </div>
                            </div>
                          ) : (
                            /* ─ Modalità visualizzazione ─ */
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-semibold text-gray-900 text-sm">{inv.client_name || <span className="text-gray-400 italic">Cliente non rilevato</span>}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{inv.date_issued} {inv.due_date && `· scadenza ${inv.due_date}`}</p>
                                {inv.activity_name && <p className="text-xs text-indigo-500 mt-0.5">{inv.activity_name}</p>}
                              </div>
                              <div className="text-right ml-4 shrink-0">
                                <p className="font-bold text-gray-900">{formatCurrency(inv.amount_gross, currency)}</p>
                                {netto && (
                                  <p className="text-xs text-emerald-600 mt-0.5">netto: {formatCurrency(netto.netAmount, currency)}</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0 ml-2">
                          {/* Badge fonte */}
                          {inv.source === 'ai' && (
                            <span className="flex items-center gap-1 text-[10px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full">
                              <Sparkles size={9} /> AI
                            </span>
                          )}
                          {/* Badge confidenza */}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${conf.cls}`}>
                            {conf.label}
                          </span>
                          {/* Stato */}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            inv.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
                            inv.status === 'OVERDUE' ? 'bg-rose-100 text-rose-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {STATUS_OPTS.find((o) => o.value === inv.status)?.label}
                          </span>
                          {/* Edit */}
                          <button
                            onClick={() => setEditIdx(isEditing ? null : i)}
                            className="p-1 text-gray-300 hover:text-indigo-500 rounded-lg hover:bg-indigo-50 transition-colors"
                          >
                            <Pencil size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Calcolo netto */}
                      {netto && isSelected && !isEditing && (
                        <div className="border-t border-gray-50 px-4 py-2.5 flex gap-4 text-xs">
                          <span className="text-gray-400">IS: <span className="text-rose-600 font-medium">-{formatCurrency(netto.taxes, currency)}</span></span>
                          <span className="text-gray-400">INPS: <span className="text-rose-600 font-medium">-{formatCurrency(netto.inps, currency)}</span></span>
                          <span className="text-gray-400">Netto: <span className="text-emerald-600 font-medium">{formatCurrency(netto.netAmount, currency)}</span></span>
                          <span className="text-gray-300">|</span>
                          <span className="text-gray-400">Accantonamento: <span className="font-medium text-gray-600">{formatCurrency(netto.totalAccrual, currency)}</span></span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex gap-2">
                  <AlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-700">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Done ───────────────────────────────────────────────── */}
          {step === 'done' && (
            <div className="p-10 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-emerald-500" />
              </div>
              <div>
                {importedCount > 0 ? (
                  <>
                    <p className="text-xl font-bold text-gray-900">Fatture importate!</p>
                    <p className="text-sm text-gray-500 mt-1">
                      <strong className="text-emerald-600">{importedCount}</strong> fatture salvate nel database.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-bold text-rose-600">Import non riuscito</p>
                    <p className="text-sm text-gray-500 mt-1">
                      0 fatture salvate — controlla i permessi Supabase o riprova.
                    </p>
                  </>
                )}
              </div>
              <div className="flex gap-3 justify-center">
                {importedCount > 0 && (
                  <button
                    onClick={() => { onClose(); navigate('/freelance') }}
                    className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700"
                  >
                    Vai al Freelance Hub →
                  </button>
                )}
                <button onClick={onClose} className="border border-gray-200 text-gray-600 px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">
                  Chiudi
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'done' && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0 bg-white">
            {step === 'map' ? (
              <>
                <button onClick={() => setStep('upload')} className="text-sm text-gray-500 hover:text-gray-700">
                  ← Indietro
                </button>
                <button
                  onClick={applyColMap}
                  disabled={!colMap.client || !colMap.amount}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  Anteprima <ChevronRight size={14} />
                </button>
              </>
            ) : step === 'preview' ? (
              <>
                <button
                  onClick={() => setStep(rawRows.length > 0 ? 'map' : 'upload')}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  ← Indietro
                </button>
                <button
                  onClick={handleImport}
                  disabled={selected.size === 0 || loading}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading
                    ? <><RefreshCw size={14} className="animate-spin" /> {loadingMsg}</>
                    : <><ChevronRight size={14} /> Importa {selected.size} fatture nel Hub</>
                  }
                </button>
              </>
            ) : (
              <div />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
