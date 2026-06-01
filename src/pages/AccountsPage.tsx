import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { formatCurrency } from '@/lib/formatters'
import {
  Plus, Pencil, Trash2, CreditCard, Banknote, PiggyBank,
  TrendingUp, Wallet, Bitcoin, HelpCircle, Star, ArrowLeftRight,
  CheckCircle2,
} from 'lucide-react'
import type { BankAccount, AccountType, Transaction } from '@/lib/database.types'

// ─── Config tipi conto ────────────────────────────────────────────────────────

const ACCOUNT_TYPES: { value: AccountType; label: string; icon: typeof CreditCard; desc: string }[] = [
  { value: 'CHECKING',     label: 'Conto corrente',  icon: Banknote,     desc: 'Conto principale per spese quotidiane' },
  { value: 'SAVINGS',      label: 'Conto risparmio', icon: PiggyBank,    desc: 'Conto dedicato ai risparmi' },
  { value: 'CREDIT_CARD',  label: 'Carta di credito',icon: CreditCard,   desc: 'Carta di credito o prepagata' },
  { value: 'CASH',         label: 'Contanti',        icon: Wallet,       desc: 'Denaro contante in portafoglio' },
  { value: 'INVESTMENT',   label: 'Investimenti',    icon: TrendingUp,   desc: 'Conto titoli, ETF, fondi' },
  { value: 'CRYPTO',       label: 'Crypto',          icon: Bitcoin,      desc: 'Portafoglio criptovalute' },
  { value: 'OTHER',        label: 'Altro',           icon: HelpCircle,   desc: 'Altro tipo di conto' },
]

const BANK_PRESETS = [
  { name: 'ING',             icon: '🦁', color: '#FF6200' },
  { name: 'Fineco',          icon: '🏦', color: '#003087' },
  { name: 'Intesa Sanpaolo', icon: '🏛️', color: '#006DB7' },
  { name: 'UniCredit',       icon: '🔴', color: '#CC0000' },
  { name: 'BancoBPM',        icon: '🏦', color: '#007AC2' },
  { name: 'Poste Italiane',  icon: '📮', color: '#FFCC00' },
  { name: 'N26',             icon: '⬛', color: '#000000' },
  { name: 'Revolut',         icon: '🌊', color: '#0075EB' },
  { name: 'PayPal',          icon: '💙', color: '#003087' },
  { name: 'Satispay',        icon: '🔵', color: '#E4032E' },
  { name: 'Hype',            icon: '💳', color: '#7B61FF' },
  { name: 'Wise',            icon: '💚', color: '#9FE870' },
  { name: 'Contanti',        icon: '💵', color: '#10b981' },
]

const COLOR_PRESETS = [
  '#6366f1','#f43f5e','#10b981','#f59e0b','#0ea5e9',
  '#8b5cf6','#ec4899','#14b8a6','#f97316','#000000',
]

const emptyForm = (): Partial<BankAccount> => ({
  name: '', bank_name: '', type: 'CHECKING',
  color: '#6366f1', icon: '🏦', balance: 0,
  currency: 'EUR', is_default: false, notes: null,
})

export function AccountsPage() {
  const { profile } = useAppStore()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<BankAccount>>(emptyForm())

  const currency = profile?.currency ?? 'EUR'

  // ─── Conti ───────────────────────────────────────────────────────────────────
  const { data: accounts = [] } = useQuery({
    queryKey: ['bank_accounts', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('user_id', profile!.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
      return (data ?? []) as BankAccount[]
    },
    enabled: !!profile,
  })

  // ─── Totale movimenti per conto (anno corrente) ───────────────────────────
  const { data: txByAccount = {} } = useQuery({
    queryKey: ['tx_by_account', profile?.id],
    queryFn: async () => {
      const year = new Date().getFullYear()
      const { data } = await supabase
        .from('transactions')
        .select('account_id, type, amount')
        .eq('user_id', profile!.id)
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`)
      const map: Record<string, { in: number; out: number; count: number }> = {}
      ;(data ?? []).forEach((t: Pick<Transaction, 'account_id' | 'type' | 'amount'>) => {
        const key = t.account_id ?? '__none__'
        if (!map[key]) map[key] = { in: 0, out: 0, count: 0 }
        map[key].count++
        if (t.type === 'INCOME') map[key].in += t.amount
        else map[key].out += t.amount
      })
      return map
    },
    enabled: !!profile,
  })

  // ─── CRUD ────────────────────────────────────────────────────────────────────
  const openNew = () => { setForm(emptyForm()); setEditingId(null); setShowModal(true) }
  const openEdit = (a: BankAccount) => {
    setForm({ ...a })
    setEditingId(a.id)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!profile || !form.name) return
    const payload = {
      user_id: profile.id,
      name: form.name!,
      bank_name: form.bank_name ?? '',
      type: form.type ?? 'CHECKING',
      color: form.color ?? '#6366f1',
      icon: form.icon ?? '🏦',
      balance: form.balance ?? 0,
      currency: form.currency ?? 'EUR',
      is_default: form.is_default ?? false,
      notes: form.notes ?? null,
    }
    if (editingId) {
      await supabase.from('bank_accounts').update(payload).eq('id', editingId)
    } else {
      // Se è il primo conto, impostalo come default
      if (accounts.length === 0) payload.is_default = true
      await supabase.from('bank_accounts').insert(payload)
    }
    qc.invalidateQueries({ queryKey: ['bank_accounts'] })
    setShowModal(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questo conto? Le transazioni associate non verranno eliminate.')) return
    await supabase.from('bank_accounts').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['bank_accounts'] })
  }

  const handleSetDefault = async (id: string) => {
    // Rimuovi default da tutti, poi imposta il nuovo
    await supabase.from('bank_accounts').update({ is_default: false }).eq('user_id', profile!.id)
    await supabase.from('bank_accounts').update({ is_default: true }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['bank_accounts'] })
  }

  // ─── Stats totali ─────────────────────────────────────────────────────────
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)
  const totalIn  = Object.values(txByAccount).reduce((s, v) => s + v.in, 0)
  const totalOut = Object.values(txByAccount).reduce((s, v) => s + v.out, 0)

  const typeConfig = (type: AccountType) => ACCOUNT_TYPES.find((t) => t.value === type) ?? ACCOUNT_TYPES[0]

  return (
    <div className="p-5 max-w-5xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">I miei conti</h1>
          <p className="text-sm text-gray-400 mt-0.5">Gestisci più conti e carte, tieni tutto sotto controllo</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700"
        >
          <Plus size={16} /> Aggiungi conto
        </button>
      </div>

      {/* KPI totali */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Patrimonio totale</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalBalance, currency)}</p>
            <p className="text-xs text-gray-400 mt-1">{accounts.length} conti attivi</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-emerald-600 uppercase tracking-wide mb-1">Entrate anno</p>
            <p className="text-2xl font-bold text-emerald-600">+{formatCurrency(totalIn, currency)}</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-rose-500 uppercase tracking-wide mb-1">Uscite anno</p>
            <p className="text-2xl font-bold text-rose-500">-{formatCurrency(totalOut, currency)}</p>
          </div>
        </div>
      )}

      {/* Lista conti */}
      {accounts.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <Wallet size={28} className="text-indigo-400" strokeWidth={1.5} />
          </div>
          <p className="text-gray-700 font-semibold text-lg">Nessun conto ancora</p>
          <p className="text-gray-400 text-sm mt-1 mb-5">
            Aggiungi i tuoi conti bancari, carte e portafogli per avere una visione completa delle tue finanze.
          </p>
          <button onClick={openNew} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700">
            Aggiungi il primo conto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((acc) => {
            const TypeIcon = typeConfig(acc.type).icon
            const stats = txByAccount[acc.id]
            return (
              <div
                key={acc.id}
                className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100"
              >
                {/* Banda colorata + header */}
                <div className="p-5 relative" style={{ background: `linear-gradient(135deg, ${acc.color}18, ${acc.color}08)` }}>
                  {/* Badge default */}
                  {acc.is_default && (
                    <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      <Star size={9} fill="currentColor" /> Principale
                    </span>
                  )}

                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-sm"
                      style={{ backgroundColor: acc.color + '22', border: `2px solid ${acc.color}33` }}
                    >
                      {acc.icon}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{acc.name}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <TypeIcon size={11} />
                        {acc.bank_name ? `${acc.bank_name} · ` : ''}{typeConfig(acc.type).label}
                      </p>
                    </div>
                  </div>

                  <p className="text-3xl font-bold" style={{ color: acc.color }}>
                    {formatCurrency(acc.balance, acc.currency)}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Saldo attuale</p>
                </div>

                {/* Stats movimenti */}
                {stats && (
                  <div className="px-5 py-3 flex gap-4 bg-gray-50 border-t border-gray-100">
                    <div>
                      <p className="text-xs text-gray-400">Entrate</p>
                      <p className="text-sm font-semibold text-emerald-600">+{formatCurrency(stats.in, currency)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Uscite</p>
                      <p className="text-sm font-semibold text-rose-500">-{formatCurrency(stats.out, currency)}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-xs text-gray-400">Transazioni</p>
                      <p className="text-sm font-semibold text-gray-600">{stats.count}</p>
                    </div>
                  </div>
                )}

                {/* Azioni */}
                <div className="px-4 py-3 flex items-center gap-2 border-t border-gray-100">
                  {!acc.is_default && (
                    <button
                      onClick={() => handleSetDefault(acc.id)}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-amber-500 transition-colors"
                    >
                      <Star size={12} /> Imposta principale
                    </button>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => window.location.href = `/transactions?account=${acc.id}`}
                      className="p-1.5 text-gray-300 hover:text-indigo-500 rounded-lg hover:bg-indigo-50"
                      title="Vedi transazioni"
                    >
                      <ArrowLeftRight size={13} />
                    </button>
                    <button
                      onClick={() => openEdit(acc)}
                      className="p-1.5 text-gray-300 hover:text-gray-600 rounded-lg hover:bg-gray-50"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(acc.id)}
                      className="p-1.5 text-gray-300 hover:text-rose-500 rounded-lg hover:bg-rose-50"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Card aggiungi nuovo */}
          <button
            onClick={openNew}
            className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-5 flex flex-col items-center justify-center gap-2 text-gray-300 hover:border-indigo-300 hover:text-indigo-400 transition-all min-h-48"
          >
            <Plus size={24} />
            <span className="text-sm font-medium">Aggiungi conto</span>
          </button>
        </div>
      )}

      {/* ── Modal crea/modifica ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">

            <div className="px-6 pt-5 pb-4 border-b bg-gray-50 flex items-center justify-between sticky top-0">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? 'Modifica conto' : 'Nuovo conto'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="px-6 py-5 space-y-5">

              {/* Preview live */}
              <div
                className="flex items-center gap-3 p-3.5 rounded-2xl border-2"
                style={{ borderColor: form.color, backgroundColor: form.color + '12' }}
              >
                <span className="text-3xl">{form.icon || '🏦'}</span>
                <div>
                  <p className="font-bold text-gray-900">{form.name || 'Nome conto'}</p>
                  <p className="text-xs text-gray-500">{form.bank_name || 'Banca'} · {formatCurrency(form.balance ?? 0, form.currency ?? 'EUR')}</p>
                </div>
                {form.is_default && (
                  <span className="ml-auto text-xs font-bold text-amber-600 flex items-center gap-1">
                    <Star size={10} fill="currentColor" /> Principale
                  </span>
                )}
              </div>

              {/* Preset banche */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Seleziona la tua banca</label>
                <div className="grid grid-cols-4 gap-1.5 max-h-32 overflow-y-auto">
                  {BANK_PRESETS.map((b) => (
                    <button
                      key={b.name}
                      type="button"
                      onClick={() => setForm((f) => ({
                        ...f,
                        bank_name: b.name,
                        icon: b.icon,
                        color: b.color,
                        name: f.name || b.name,
                      }))}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        form.bank_name === b.name
                          ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
                          : 'border-gray-100 hover:border-gray-300 bg-gray-50'
                      }`}
                    >
                      <div className="text-lg">{b.icon}</div>
                      <div className="text-[10px] text-gray-600 mt-0.5 truncate">{b.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Nome */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Nome conto</label>
                <input
                  type="text"
                  placeholder="Es. Conto ING principale, Carta Visa…"
                  value={form.name ?? ''}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
                />
              </div>

              {/* Tipo conto */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Tipo conto</label>
                <div className="grid grid-cols-2 gap-2">
                  {ACCOUNT_TYPES.map(({ value, label, icon: Icon, desc }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm({ ...form, type: value })}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                        form.type === value
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                      }`}
                    >
                      <Icon size={16} className={form.type === value ? 'text-indigo-600' : 'text-gray-400'} />
                      <div>
                        <p className={`text-xs font-semibold ${form.type === value ? 'text-indigo-700' : 'text-gray-700'}`}>{label}</p>
                        <p className="text-[10px] text-gray-400 leading-tight">{desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Saldo + Valuta */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Saldo attuale</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                    <input
                      type="number"
                      step="0.01"
                      value={form.balance ?? 0}
                      onChange={(e) => setForm({ ...form, balance: +e.target.value })}
                      className="w-full border border-gray-200 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Valuta</label>
                  <select
                    value={form.currency ?? 'EUR'}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
                  >
                    <option value="EUR">EUR €</option>
                    <option value="USD">USD $</option>
                    <option value="GBP">GBP £</option>
                    <option value="CHF">CHF</option>
                    <option value="BTC">BTC ₿</option>
                  </select>
                </div>
              </div>

              {/* Colore */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Colore</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, color: c })}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? 'border-gray-800 scale-110' : 'border-white shadow'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={form.color ?? '#6366f1'}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="w-7 h-7 rounded-full cursor-pointer border border-gray-200"
                  />
                </div>
              </div>

              {/* Conto principale */}
              <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={form.is_default ?? false}
                  onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                  className="accent-amber-500 w-4 h-4"
                />
                <div>
                  <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <Star size={13} className="text-amber-500" fill="currentColor" /> Conto principale
                  </p>
                  <p className="text-xs text-gray-400">Preselezionato quando aggiungi nuove transazioni</p>
                </div>
                {form.is_default && <CheckCircle2 size={16} className="text-amber-500 ml-auto" />}
              </label>

              {/* Note */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Note (opzionale)</label>
                <input
                  type="text"
                  placeholder="Es. IBAN, numero carta, note personali…"
                  value={form.notes ?? ''}
                  onChange={(e) => setForm({ ...form, notes: e.target.value || null })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
                />
              </div>

              {/* CTA */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-xl hover:bg-gray-50 text-sm"
                >
                  Annulla
                </button>
                <button
                  onClick={handleSave}
                  disabled={!form.name}
                  className="flex-1 text-white font-semibold py-2.5 rounded-xl disabled:opacity-40 text-sm transition-colors hover:opacity-90"
                  style={{ backgroundColor: form.color ?? '#6366f1' }}
                >
                  {editingId ? 'Salva modifiche' : 'Aggiungi conto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
