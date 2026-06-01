import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { exchangeCodeForToken, createFICClient } from '@/lib/fattureInCloud'
import { useAppStore } from '@/store/useAppStore'

export function FICCallbackPage() {
  const navigate = useNavigate()
  const { profile } = useAppStore()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Connessione a Fatture in Cloud in corso...')

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const state = params.get('state')
      const error = params.get('error')

      if (error) {
        setStatus('error')
        setMessage(`Autorizzazione negata: ${error}`)
        return
      }

      if (!code || !profile) {
        setStatus('error')
        setMessage('Parametri mancanti. Riprova.')
        return
      }

      // Verifica state per sicurezza
      const savedState = sessionStorage.getItem('fic_oauth_state')
      if (state !== savedState) {
        setStatus('error')
        setMessage('Errore di sicurezza OAuth. Riprova.')
        return
      }

      try {
        setMessage('Scambio token in corso...')

        // 1. Exchange code → token
        const tokens = await exchangeCodeForToken(code)
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

        setMessage('Recupero aziende collegate...')

        // 2. Recupera aziende collegate
        const client = createFICClient(tokens.access_token, '')
        const companies = await client.getUserCompanies()

        if (!companies.length) {
          setStatus('error')
          setMessage('Nessuna azienda trovata nel tuo account Fatture in Cloud.')
          return
        }

        // Usa la prima azienda (o quella con più accessi)
        const company = companies[0]

        setMessage('Salvataggio connessione...')

        // 3. Salva in Supabase
        await supabase.from('fic_connections').upsert({
          user_id: profile.id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
          company_id: String(company.id),
          company_name: company.name,
          connected_at: new Date().toISOString(),
        })

        sessionStorage.removeItem('fic_oauth_state')
        setStatus('success')
        setMessage(`Connesso a "${company.name}" con successo!`)

        setTimeout(() => navigate('/settings'), 2000)

      } catch (err) {
        console.error(err)
        setStatus('error')
        setMessage(`Errore durante la connessione: ${err instanceof Error ? err.message : 'Errore sconosciuto'}`)
      }
    }

    run()
  }, [profile, navigate])

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
        <div className="text-4xl mb-4">
          {status === 'loading' && '⏳'}
          {status === 'success' && '✅'}
          {status === 'error' && '❌'}
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">
          {status === 'loading' && 'Connessione in corso'}
          {status === 'success' && 'Connessione riuscita'}
          {status === 'error' && 'Errore di connessione'}
        </h2>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        {status === 'error' && (
          <button
            onClick={() => navigate('/settings')}
            className="bg-income text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600"
          >
            Torna alle Impostazioni
          </button>
        )}
        {status === 'success' && (
          <p className="text-xs text-gray-400">Reindirizzamento automatico...</p>
        )}
      </div>
    </div>
  )
}
