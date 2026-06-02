import type { InpsRegime } from '@/lib/fiscalePlanning'
import { CheckCircle2 } from 'lucide-react'

interface InpsOption {
  value: InpsRegime
  label: string
  who: string
  examples: string
  variabile: string
  fisso: string | null
  color: string
  accentBg: string
  accentText: string
}

const OPTIONS: InpsOption[] = [
  {
    value: 'GESTIONE_SEPARATA',
    label: 'Gestione Separata',
    who: 'Professionisti senza cassa',
    examples: 'Consulenti, copywriter, sviluppatori, designer, avvocati, commercialisti…',
    variabile: '26.23%',
    fisso: null,
    color: '#8b5cf6',
    accentBg: '#f5f3ff',
    accentText: '#7c3aed',
  },
  {
    value: 'IVS_ARTIGIANI',
    label: 'IVS Artigiani',
    who: 'Lavoratori artigiani',
    examples: 'Idraulici, elettricisti, meccanici, parrucchieri, sarti, falegnami…',
    variabile: '24.00%',
    fisso: '~€ 4.460/anno',
    color: '#0ea5e9',
    accentBg: '#f0f9ff',
    accentText: '#0369a1',
  },
  {
    value: 'IVS_COMMERCIANTI',
    label: 'IVS Commercianti',
    who: 'Commercianti al dettaglio e all\'ingrosso',
    examples: 'Negozi fisici, e-commerce, ambulanti, agenti di commercio…',
    variabile: '24.48%',
    fisso: '~€ 4.460/anno',
    color: '#10b981',
    accentBg: '#f0fdf4',
    accentText: '#047857',
  },
]

interface Props {
  value: InpsRegime
  onChange: (v: InpsRegime) => void
}

export function InpsRegimeSelector({ value, onChange }: Props) {
  return (
    <div className="space-y-2.5">
      {OPTIONS.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${
              selected
                ? 'shadow-sm'
                : 'border-gray-100 hover:border-gray-200 bg-white hover:bg-gray-50'
            }`}
            style={selected
              ? { borderColor: opt.color, backgroundColor: opt.accentBg }
              : undefined
            }
          >
            <div className="flex items-start gap-3">
              {/* Indicatore selezione */}
              <div className="mt-0.5 shrink-0">
                {selected
                  ? <CheckCircle2 size={18} style={{ color: opt.color }} />
                  : <div className="w-[18px] h-[18px] rounded-full border-2 border-gray-300" />
                }
              </div>

              {/* Contenuto */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`font-semibold text-sm ${selected ? '' : 'text-gray-800'}`}
                     style={selected ? { color: opt.color } : undefined}>
                    {opt.label}
                  </p>
                  <span className="text-xs text-gray-500">— {opt.who}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{opt.examples}</p>

                {/* Rate pills */}
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                    style={{ backgroundColor: opt.color + '18' }}
                  >
                    <span className="text-xs font-bold" style={{ color: opt.accentText }}>
                      {opt.variabile}
                    </span>
                    <span className="text-xs" style={{ color: opt.accentText + 'aa' }}>
                      sul reddito imponibile
                    </span>
                  </div>

                  {opt.fisso ? (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50">
                      <span className="text-xs font-bold text-amber-700">+</span>
                      <span className="text-xs font-bold text-amber-700">{opt.fisso}</span>
                      <span className="text-xs text-amber-500">quota fissa</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100">
                      <span className="text-xs text-gray-400">Nessuna quota fissa</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </button>
        )
      })}

      {/* Disclaimer */}
      <p className="text-xs text-gray-400 px-1 pt-1">
        Le aliquote indicate sono quelle standard 2025 (INPS Circ. 35/2025).
        Casi particolari (dipendente, pensionato, cassa professionale) possono variare.
        I calcoli dell'app sono <strong>indicativi</strong> — consulta il tuo commercialista.
      </p>
    </div>
  )
}
