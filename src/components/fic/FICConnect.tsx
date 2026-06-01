import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import {
  getFICAuthUrl,
  createFICClient,
  ficInvoiceToBudgetFlow,
} from '@/lib/fattureInCloud'
import { formatCurrency } from '@/lib/formatters'
import { Link2Off, RefreshCw, CheckCircle2, Link } from 'lucide-react'

const FIC_CLIENT_ID = import.meta.env.VITE_FIC_CLIENT_ID

export function FICConnect() {
  const { profile, selectedYear } = useAppStore()
  const qc = useQueryClient()
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  const { data: connection } = useQuery({
    queryKey: ['fic_connection', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('fic_connections')
        .select('*')
        .eq('user_id', profile!.id)
        .single()
      return data
    },
    enabled: !!profile,
  })

  const handleConnect = () => {
    if (!FIC_CLIENT_ID) {
      alert('Client ID Fatture in Cloud non configurato. Aggiungi VITE_FIC_CLIENT_ID nel file .env')
      return
    }
    // Genera state random per sicurezza OAuth
    const state = Math.random().toString(36).substring(2)
    sessionStorage.setItem('fic_oauth_state', state)
    window.location.href = getFICAuthUrl(state)
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnettere Fatture in Cloud? Le fatture già importate rimarranno.')) return
    await supabase.from('fic_connections').delete().eq('user_id', profile!.id)
    qc.invalidateQueries({ queryKey: ['fic_connection'] })
  }

  const handleSync = async () => {
    if (!connection || !profile) return
    setSyncing(true)
    setSyncResult(null)

    try {
      const client = createFICClient(connection.access_token, connection.company_id)
      const invoices = await client.getAllInvoices(selectedYear)

      if (!invoices.length) {
        setSyncResult(`Nessuna fattura trovata per il ${selectedYear}.`)
        return
      }

      // Converti e inserisci (upsert per evitare duplicati)
      const mapped = invoices.map((inv) =>
        ficInvoiceToBudgetFlow(inv, profile.id, profile.tax_regime, profile.ateco_coefficient)
      )

      // Elimina le fatture FIC esistenti per l'anno (poi reinserisce)
      await supabase
        .from('invoices')
        .delete()
        .eq('user_id', profile.id)
        .gte('date_issued', `${selectedYear}-01-01`)
        .lte('date_issued', `${selectedYear}-12-31`)
        .not('fic_id', 'is', null)

      const { error } = await supabase.from('invoices').insert(mapped)

      if (error) throw error

      // Aggiorna last_sync_at
      await supabase
        .from('fic_connections')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('user_id', profile.id)

      const totalGross = mapped.reduce((s, i) => s + i.amount_gross, 0)
      setSyncResult(
        `✅ Sincronizzate ${mapped.length} fatture per ${selectedYear} — Totale lordo: ${formatCurrency(totalGross, profile.currency)}`
      )
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['fic_connection'] })

    } catch (err) {
      setSyncResult(`❌ Errore: ${err instanceof Error ? err.message : 'Errore sconosciuto'}`)
    } finally {
      setSyncing(false)
    }
  }

  // Integrazione non configurata → messaggio utente pulito, nessun dettaglio tecnico
  if (!FIC_CLIENT_ID) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
          <Link2Off size={18} className="text-gray-400" />
        </div>
        <div>
          <p className="font-semibold text-gray-700 text-sm">Integrazione non attiva</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            La connessione con Fatture in Cloud non è ancora disponibile in questa versione dell'app.
            Puoi comunque importare le fatture manualmente tramite il pulsante <strong>Importa AI</strong> nella sezione Fatture Emesse.
          </p>
        </div>
      </div>
    )
  }

  // Non connesso
  if (!connection) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
            <Link size={18} className="text-indigo-500" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Fatture in Cloud</h3>
            <p className="text-xs text-gray-400">Non connesso</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Collega il tuo account Fatture in Cloud per importare automaticamente le fatture emesse e aggiornare la soglia forfettaria in tempo reale.
        </p>
        <div className="space-y-1.5 mb-4">
          {['Importa fatture emesse automaticamente', 'Calcolo tasse e INPS automatico', 'Soglia forfettaria sempre aggiornata', 'Sincronizzazione con un click'].map((f) => (
            <div key={f} className="flex items-center gap-2 text-sm text-gray-500">
              <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
              {f}
            </div>
          ))}
        </div>
        <button
          onClick={handleConnect}
          className="w-full bg-indigo-500 text-white font-semibold py-2.5 rounded-xl hover:bg-indigo-600 transition-colors text-sm"
        >
          Connetti Fatture in Cloud
        </button>
      </div>
    )
  }

  // Connesso
  return (
    <div className="bg-white border-2 border-indigo-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Link size={18} className="text-indigo-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Fatture in Cloud</h3>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-emerald-500 rounded-full" />
              <span className="text-sm text-emerald-600 font-medium">Connesso</span>
            </div>
          </div>
        </div>
        <button
          onClick={handleDisconnect}
          className="text-xs text-gray-400 hover:text-rose-500 transition-colors"
        >
          Disconnetti
        </button>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-500">Azienda</span>
          <span className="font-medium text-gray-900">{connection.company_name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Ultima sincronizzazione</span>
          <span className="font-medium text-gray-900">
            {connection.last_sync_at
              ? new Date(connection.last_sync_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
              : 'Mai'}
          </span>
        </div>
      </div>

      <button
        onClick={handleSync}
        disabled={syncing}
        className="w-full bg-indigo-500 text-white font-semibold py-2.5 rounded-xl hover:bg-indigo-600 disabled:opacity-50 transition-colors text-sm flex items-center justify-center gap-2"
      >
        <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
        {syncing ? `Sincronizzazione ${selectedYear}...` : `Sincronizza fatture ${selectedYear}`}
      </button>

      {syncResult && (
        <p className={`text-xs mt-2 p-2 rounded-lg ${syncResult.startsWith('✅') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {syncResult}
        </p>
      )}
    </div>
  )
}
