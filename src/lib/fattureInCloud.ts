/**
 * Fatture in Cloud API v2 — Client
 * Docs: https://developers.fattureincloud.it/docs
 *
 * Per attivare:
 * 1. Vai su https://developers.fattureincloud.it
 * 2. Crea una nuova app
 * 3. Imposta Redirect URI: http://localhost:5173/auth/fic-callback
 * 4. Copia Client ID e Client Secret nel file .env
 */

const FIC_CLIENT_ID = import.meta.env.VITE_FIC_CLIENT_ID as string
const FIC_CLIENT_SECRET = import.meta.env.VITE_FIC_CLIENT_SECRET as string
const FIC_REDIRECT_URI = `${window.location.origin}/auth/fic-callback`
const FIC_BASE_URL = 'https://api-v2.fattureincloud.it'

// Scopes necessari
const FIC_SCOPES = [
  'issued_documents.invoices:r',
  'issued_documents.invoices:w',
  'entity.clients:r',
  'situation:r',
].join(' ')

// ─── OAuth ────────────────────────────────────────────────

export function getFICAuthUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: FIC_CLIENT_ID,
    redirect_uri: FIC_REDIRECT_URI,
    scope: FIC_SCOPES,
    state,
  })
  return `https://api-v2.fattureincloud.it/oauth/authorize?${params}`
}

export async function exchangeCodeForToken(code: string): Promise<FICTokenResponse> {
  const res = await fetch(`${FIC_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: FIC_CLIENT_ID,
      client_secret: FIC_CLIENT_SECRET,
      redirect_uri: FIC_REDIRECT_URI,
      code,
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`)
  return res.json()
}

export async function refreshAccessToken(refreshToken: string): Promise<FICTokenResponse> {
  const res = await fetch(`${FIC_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: FIC_CLIENT_ID,
      client_secret: FIC_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`)
  return res.json()
}

// ─── API Client ───────────────────────────────────────────

class FICClient {
  private token: string
  private companyId: string

  constructor(token: string, companyId: string) {
    this.token = token
    this.companyId = companyId
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${FIC_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`FIC API error ${res.status}: ${JSON.stringify(err)}`)
    }
    return res.json()
  }

  // Recupera le aziende collegate all'account
  async getUserCompanies(): Promise<FICCompany[]> {
    const data = await this.request<{ data: FICCompany[] }>('/user/companies')
    return data.data
  }

  // Recupera le fatture emesse di un anno
  async getInvoices(year: number, page = 1): Promise<FICInvoicesResponse> {
    const params = new URLSearchParams({
      'q[date_from]': `${year}-01-01`,
      'q[date_to]': `${year}-12-31`,
      'q[type]': 'a',  // 'a' = fattura ordinaria
      per_page: '50',
      page: String(page),
      fields: 'id,date,number,entity,gross_amount,net_amount,status,payment_terms,items_list',
    })
    return this.request(`/c/${this.companyId}/issued_documents?${params}`)
  }

  // Recupera TUTTE le fatture di un anno (gestisce la paginazione)
  async getAllInvoices(year: number): Promise<FICInvoice[]> {
    const all: FICInvoice[] = []
    let page = 1
    let hasMore = true

    while (hasMore) {
      const res = await this.getInvoices(year, page)
      all.push(...res.data)
      hasMore = res.current_page < res.last_page
      page++
    }

    return all
  }
}

export function createFICClient(token: string, companyId: string) {
  return new FICClient(token, companyId)
}

// ─── Converter: FIC Invoice → BudgetFlow Invoice ──────────

import { calcNetto } from './nettometro'
import type { TaxRegime } from './database.types'

export function ficInvoiceToBudgetFlow(
  inv: FICInvoice,
  userId: string,
  taxRegime: TaxRegime,
  atecoCoefficient: number
) {
  const gross = inv.gross_amount ?? 0
  const netto = calcNetto(gross, taxRegime, atecoCoefficient)

  return {
    user_id: userId,
    date_issued: inv.date,
    client_name: inv.entity?.name ?? 'Cliente sconosciuto',
    amount_gross: gross,
    amount_net: netto.netAmount,
    tax_amount: netto.taxes,
    inps_amount: netto.inps,
    status: mapFICStatus(inv.status),
    due_date: inv.payment_terms?.due_date ?? inv.date,
    activity_name: null,
    fic_id: String(inv.id),
  }
}

function mapFICStatus(status: string): 'PAID' | 'PENDING' | 'OVERDUE' {
  if (status === 'paid') return 'PAID'
  if (status === 'expired') return 'OVERDUE'
  return 'PENDING'
}

// ─── Tipi ─────────────────────────────────────────────────

export interface FICTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

export interface FICCompany {
  id: number
  name: string
  type: string
  access_info: { access_level: number }
}

export interface FICInvoice {
  id: number
  date: string
  number: string
  entity?: { name: string; vat_number?: string }
  gross_amount: number
  net_amount: number
  status: string
  payment_terms?: { due_date: string }
  items_list?: Array<{ name: string; gross_price: number; qty: number }>
}

export interface FICInvoicesResponse {
  data: FICInvoice[]
  current_page: number
  last_page: number
  total: number
}
