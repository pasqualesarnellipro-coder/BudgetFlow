import { useState, useMemo } from 'react'
import { Search, ChevronRight, CheckCircle2, X } from 'lucide-react'
import { COMMON_ATECO, ATECO_GROUPS, searchGroups, type AtecoGroup } from '@/lib/atecoData'

interface Props {
  currentCoefficient: number
  onSelect: (coefficient: number, code?: string) => void
}

export function AtecoLookup({ currentCoefficient, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<AtecoGroup | null>(null)

  const filteredCommon = useMemo(() => {
    if (!query.trim()) return COMMON_ATECO.slice(0, 12)
    const q = query.toLowerCase()
    return COMMON_ATECO.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.code.includes(q)
    ).slice(0, 15)
  }, [query])

  const filteredGroups = useMemo(() => searchGroups(query), [query])

  const pctDisplay = (c: number) => `${Math.round(c * 100)}%`

  const COLOR: Record<number, string> = {
    0.40: 'bg-emerald-100 text-emerald-700',
    0.54: 'bg-teal-100 text-teal-700',
    0.62: 'bg-sky-100 text-sky-700',
    0.67: 'bg-indigo-100 text-indigo-700',
    0.78: 'bg-violet-100 text-violet-700',
    0.86: 'bg-amber-100 text-amber-700',
  }

  const handlePickGroup = (group: AtecoGroup) => {
    setSelectedGroup(group)
  }

  const handleConfirm = (coeff: number, code?: string) => {
    onSelect(coeff, code)
    setOpen(false)
    setQuery('')
    setSelectedGroup(null)
  }

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-xs text-indigo-600 font-medium hover:text-indigo-800 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-xl transition-colors"
      >
        <Search size={12} />
        Trova il mio coefficiente dal codice ATECO
      </button>

      {!open ? null : (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">

            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-r from-indigo-50 to-violet-50 shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Trova il tuo coefficiente ATECO</h2>
                  <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                    Cerca la tua professione o incolla il codice ATECO della tua P.IVA.
                    Lo trovi nel tuo certificato di attribuzione del codice fiscale / P.IVA.
                  </p>
                </div>
                <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 ml-3 mt-0.5">
                  <X size={18} />
                </button>
              </div>

              {/* Barra di ricerca */}
              <div className="relative mt-4">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Es: copywriter, consulenza, 73.11, sviluppatore…"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSelectedGroup(null) }}
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                />
              </div>
            </div>

            {/* Corpo */}
            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4">

              {/* Selezione dettaglio gruppo */}
              {selectedGroup ? (
                <div className="space-y-3">
                  <button onClick={() => setSelectedGroup(null)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                    ← Torna alla ricerca
                  </button>
                  <div className={`rounded-xl p-4 ${COLOR[selectedGroup.coefficient]?.replace('text-', 'border-') || ''} border bg-white`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-gray-900 text-sm">{selectedGroup.label}</p>
                      <span className={`text-sm font-bold px-3 py-1 rounded-full ${COLOR[selectedGroup.coefficient] || 'bg-gray-100 text-gray-600'}`}>
                        {pctDisplay(selectedGroup.coefficient)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">{selectedGroup.description}</p>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {selectedGroup.examples.map((e) => (
                        <span key={e} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">{e}</span>
                      ))}
                    </div>
                    <button
                      onClick={() => handleConfirm(selectedGroup.coefficient)}
                      className="w-full bg-indigo-600 text-white font-semibold py-2.5 rounded-xl text-sm hover:bg-indigo-700 flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 size={15} />
                      Usa coefficiente {pctDisplay(selectedGroup.coefficient)}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Attività comuni filtrate */}
                  {filteredCommon.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
                        {query ? 'Risultati' : 'Attività più comuni'}
                      </p>
                      <div className="space-y-1">
                        {filteredCommon.map((item) => (
                          <button
                            key={item.code}
                            type="button"
                            onClick={() => handleConfirm(item.coefficient, item.code)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left transition-colors group"
                          >
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg shrink-0 ${COLOR[item.coefficient] || 'bg-gray-100 text-gray-600'}`}>
                              {pctDisplay(item.coefficient)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{item.label}</p>
                              <p className="text-xs text-gray-400">ATECO {item.code}</p>
                            </div>
                            {item.coefficient === currentCoefficient && (
                              <CheckCircle2 size={14} className="text-indigo-500 shrink-0" />
                            )}
                            <ChevronRight size={14} className="text-gray-300 shrink-0 group-hover:text-gray-500" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Gruppi di macro-categoria */}
                  {query && filteredGroups.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Categorie generali</p>
                      <div className="space-y-1">
                        {filteredGroups.map((group) => (
                          <button
                            key={group.label}
                            type="button"
                            onClick={() => handlePickGroup(group)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left transition-colors group"
                          >
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg shrink-0 ${COLOR[group.coefficient] || 'bg-gray-100 text-gray-600'}`}>
                              {pctDisplay(group.coefficient)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900">{group.label}</p>
                              <p className="text-xs text-gray-400 truncate">{group.examples.slice(0, 3).join(', ')}…</p>
                            </div>
                            <ChevronRight size={14} className="text-gray-300 shrink-0 group-hover:text-gray-500" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tutti i gruppi (quando non c'è ricerca) */}
                  {!query && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Tutte le categorie forfettario</p>
                      <div className="space-y-1">
                        {ATECO_GROUPS.map((group) => (
                          <button
                            key={group.label}
                            type="button"
                            onClick={() => handlePickGroup(group)}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 text-left transition-colors group border border-gray-100"
                          >
                            <span className={`text-sm font-bold px-2.5 py-1 rounded-lg shrink-0 ${COLOR[group.coefficient] || 'bg-gray-100 text-gray-600'}`}>
                              {pctDisplay(group.coefficient)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900">{group.label}</p>
                              <p className="text-xs text-gray-400 truncate">{group.examples.slice(0, 3).join(', ')}</p>
                            </div>
                            <ChevronRight size={14} className="text-gray-300 shrink-0 group-hover:text-indigo-400" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {query && filteredCommon.length === 0 && filteredGroups.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-2xl mb-2">🔍</p>
                      <p className="text-sm text-gray-500 font-medium">Nessun risultato per "{query}"</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Prova con un termine diverso, oppure consulta il tuo commercialista per il codice ATECO esatto.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer info */}
            <div className="shrink-0 px-6 py-3 border-t bg-gray-50">
              <p className="text-[11px] text-gray-400 leading-relaxed">
                💡 Il coefficiente di redditività è stabilito dalla <strong>Legge 190/2014, Allegato 4</strong>.
                In caso di dubbio, chiedi al tuo commercialista — il coefficiente influisce direttamente sul calcolo delle tasse.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
