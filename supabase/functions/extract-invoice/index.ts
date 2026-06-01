/**
 * Supabase Edge Function: extract-invoice
 *
 * Modello: claude-haiku-3-5 (~€0.003 per chiamata — 15× più economico di Opus)
 * Rate limit: MAX_CALLS_PER_MONTH per utente (default 10 gratis)
 *
 * Variabili d'ambiente richieste:
 *   ANTHROPIC_API_KEY     — chiave API Anthropic
 *   AI_CALLS_PER_MONTH    — (opzionale) limite mensile per utente, default 10
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.27.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_CALLS = parseInt(Deno.env.get('AI_CALLS_PER_MONTH') ?? '10')

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Autenticazione utente ─────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Non autorizzato.')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (authErr || !user) throw new Error('Sessione non valida. Rieffettua il login.')

    // ── Rate limiting mensile ─────────────────────────────────────────────────
    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const { data: usage } = await supabaseAdmin
      .from('ai_usage')
      .select('calls')
      .eq('user_id', user.id)
      .eq('month', monthKey)
      .single()

    const currentCalls = usage?.calls ?? 0

    if (currentCalls >= MAX_CALLS) {
      return new Response(
        JSON.stringify({
          error: `Hai raggiunto il limite di ${MAX_CALLS} estrazioni AI gratuite per questo mese. Riprova il mese prossimo.`,
          invoices: [],
          limitReached: true,
          used: currentCalls,
          limit: MAX_CALLS,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // ── Parsing del body ──────────────────────────────────────────────────────
    const { base64, mediaType, fileName } = await req.json() as {
      base64: string
      mediaType: string
      fileName: string
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY non configurata.')

    // ── Chiamata Claude ───────────────────────────────────────────────────────
    const client = new Anthropic({ apiKey })

    const systemPrompt = `Sei un assistente specializzato nell'estrazione di dati da fatture italiane ed estere.
Estrai SEMPRE i dati in formato JSON. Sii preciso sui numeri. Per i campi non trovati usa null o stringa vuota.
Le date devono essere in formato YYYY-MM-DD.
Gli importi devono essere numeri decimali (es. 1234.56, non "1.234,56").`

    const userPrompt = `Analizza questa fattura ed estrai i dati strutturati.

Restituisci ESCLUSIVAMENTE un JSON con questo schema (nessun altro testo):
{
  "invoices": [
    {
      "client_name": "Nome cliente o azienda",
      "date_issued": "YYYY-MM-DD",
      "due_date": "YYYY-MM-DD o null se non presente",
      "amount_gross": 1234.56,
      "has_vat": true,
      "vat_rate": 22,
      "amount_before_vat": 1012.34,
      "description": "Descrizione servizio/prodotto",
      "invoice_number": "numero fattura se presente",
      "status": "PAID o PENDING o OVERDUE",
      "activity_name": "nome progetto/attività se rilevabile",
      "confidence": "high o medium o low"
    }
  ]
}

Note:
- "amount_gross" è il totale IVA inclusa
- "confidence": high = campi chiari, medium = qualcosa incerto, low = documento difficile
- Per italiano: cerca "Totale", "Totale fattura", "Da pagare"
- Se non è una fattura: {"invoices": [], "error": "Il documento non sembra una fattura"}`

    const isPDF = mediaType === 'application/pdf'

    const message = await client.messages.create({
      model: 'claude-haiku-3-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          ...(isPDF
            ? [{ type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }]
            : [{ type: 'image' as const, source: { type: 'base64' as const, media_type: (mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'), data: base64 } }]
          ),
          { type: 'text', text: userPrompt },
        ],
      }],
    })

    // ── Parsing risposta ──────────────────────────────────────────────────────
    const rawText = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = rawText.match(/```json\n?([\s\S]*?)\n?```/) ?? rawText.match(/(\{[\s\S]*\})/)
    const jsonStr = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]) : rawText

    let parsed: { invoices: unknown[]; error?: string }
    try {
      parsed = JSON.parse(jsonStr.trim())
    } catch {
      throw new Error(`Risposta AI non valida: ${rawText.slice(0, 200)}`)
    }

    if (parsed.error) throw new Error(parsed.error)

    // ── Aggiorna contatore utilizzo ───────────────────────────────────────────
    await supabaseAdmin
      .from('ai_usage')
      .upsert({ user_id: user.id, month: monthKey, calls: currentCalls + 1 })

    return new Response(
      JSON.stringify({
        invoices: parsed.invoices ?? [],
        fileName,
        model: 'claude-haiku-3-5',
        tokens: message.usage,
        // Info utilizzo per mostrare badge nell'UI
        usage: { used: currentCalls + 1, limit: MAX_CALLS, remaining: MAX_CALLS - currentCalls - 1 },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore sconosciuto'
    return new Response(
      JSON.stringify({ error: msg, invoices: [] }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
