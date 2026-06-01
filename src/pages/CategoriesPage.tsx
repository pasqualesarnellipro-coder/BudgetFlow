import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { Plus, Pencil, Trash2, Sparkles, Eye, EyeOff } from 'lucide-react'
import { HelpTooltip } from '@/components/ui/HelpTooltip'
import type { Category, CategoryType } from '@/lib/database.types'

const SECTIONS: {
  type: CategoryType
  label: string
  description: string
  accent: string
  ring: string
  dot: string
  headerBg: string
}[] = [
  {
    type: 'INCOME',
    label: 'Entrate',
    description: 'Stipendio, lavoro autonomo, rendite, rimborsi…',
    accent: 'text-emerald-600',
    ring: 'ring-emerald-200',
    dot: 'bg-emerald-500',
    headerBg: 'bg-gradient-to-r from-emerald-50 to-white',
  },
  {
    type: 'EXPENSES',
    label: 'Spese',
    description: 'Casa, alimentare, trasporti, abbonamenti…',
    accent: 'text-rose-600',
    ring: 'ring-rose-200',
    dot: 'bg-rose-500',
    headerBg: 'bg-gradient-to-r from-rose-50 to-white',
  },
  {
    type: 'SAVINGS',
    label: 'Risparmi',
    description: 'Fondo emergenza, pensione, obiettivi…',
    accent: 'text-amber-600',
    ring: 'ring-amber-200',
    dot: 'bg-amber-500',
    headerBg: 'bg-gradient-to-r from-amber-50 to-white',
  },
  {
    type: 'DEBTS',
    label: 'Debiti',
    description: 'Mutuo, prestiti, carte di credito…',
    accent: 'text-violet-600',
    ring: 'ring-violet-200',
    dot: 'bg-violet-500',
    headerBg: 'bg-gradient-to-r from-violet-50 to-white',
  },
]

const ICON_OPTIONS = [
  '💼','🤝','↩️','🏠','📈','🏆','➕','🛒','🍽️','🚇','⛽','🩺',
  '📺','📱','👔','🏃','🎓','🎭','✈️','🛡️','🏛️','🎁','📋','🔐',
  '🌅','📊','🏡','🧳','🎯','🏦','🔑','📝','💳','📅','⚖️','🧾',
  '💡','🤝','©️','🖥️','📚','📣','🗂️','🚄','📡','🛍️','🔔','🌴',
  '🐾','🎵','🔧','💰','📦','📢','🎮','🎸','🐶','💍','🏋️','🌍',
]

export function CategoriesPage() {
  const { profile } = useAppStore()
  const qc = useQueryClient()
  const [modal, setModal] = useState<{ type: CategoryType; editing?: Category } | null>(null)
  const [form, setForm] = useState({ name: '', icon: '📋' })
  const [showInactive, setShowInactive] = useState(false)

  const { data: categories = [] } = useQuery({
    queryKey: ['categories', profile?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', profile!.id)
        .order('name', { ascending: true })
      return data ?? []
    },
    enabled: !!profile,
  })

  const openNew = (type: CategoryType) => {
    setForm({ name: '', icon: '📋' })
    setModal({ type })
  }
  const openEdit = (cat: Category) => {
    setForm({ name: cat.name, icon: cat.icon })
    setModal({ type: cat.type, editing: cat })
  }

  const handleSave = async () => {
    if (!profile || !form.name) return
    if (modal?.editing) {
      await supabase.from('categories').update({ name: form.name, icon: form.icon }).eq('id', modal.editing.id)
    } else {
      await supabase.from('categories').insert({
        user_id: profile.id,
        name: form.name,
        icon: form.icon,
        type: modal!.type,
        active: true,
      })
    }
    qc.invalidateQueries({ queryKey: ['categories'] })
    setModal(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questa categoria? Le transazioni collegate non verranno cancellate.')) return
    await supabase.from('categories').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['categories'] })
  }

  const toggleActive = async (cat: Category) => {
    await supabase.from('categories').update({ active: !cat.active }).eq('id', cat.id)
    qc.invalidateQueries({ queryKey: ['categories'] })
  }

  const visibleCats = (type: CategoryType) =>
    (categories as Category[]).filter(
      (c) => c.type === type && (showInactive ? true : c.active)
    )

  const inactiveCount = (categories as Category[]).filter((c) => !c.active).length

  const sectionLabel: Record<CategoryType, string> = {
    INCOME: 'Entrate',
    EXPENSES: 'Spese',
    SAVINGS: 'Risparmi',
    DEBTS: 'Debiti',
    BUSINESS_INCOME: 'Entrate Business',
    BUSINESS_EXPENSES: 'Spese Business',
  }

  return (
    <div className="p-5 space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categorie</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Organizza le tue voci di bilancio come preferisci
          </p>
        </div>
        <div className="flex items-center gap-2">
          {inactiveCount > 0 && (
            <button
              onClick={() => setShowInactive((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-2 rounded-xl transition-colors"
            >
              {showInactive ? <EyeOff size={13} /> : <Eye size={13} />}
              {showInactive ? 'Nascondi disattivate' : `${inactiveCount} disattivate`}
            </button>
          )}
          <HelpTooltip
            title="Come funzionano le categorie"
            content="Le categorie predefinite sono un punto di partenza. Puoi aggiungerne di nuove, rinominarle, cambiare icona o disattivarle. Quelle disattivate non appaiono nei menu ma non eliminano i dati storici."
            position="bottom"
            size="lg"
          />
        </div>
      </div>

      {/* Banner personalizzazione */}
      <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 border border-indigo-100 rounded-2xl px-5 py-4 flex items-start gap-4">
        <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles size={16} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-indigo-900">Tutto è personalizzabile</p>
          <p className="text-xs text-indigo-600/80 mt-0.5 leading-relaxed">
            Le categorie predefinite sono pensate per essere universali, ma ogni persona è diversa.
            Aggiungine di nuove, rinominale, cambia l'icona. BudgetFlow si adatta a te —
            che tu sia un copywriter, un consulente, un commerciante o un dipendente.
          </p>
        </div>
      </div>

      {/* Griglia sezioni */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {SECTIONS.map((section) => {
          const cats = visibleCats(section.type)
          const total = (categories as Category[]).filter((c) => c.type === section.type).length
          return (
            <div key={section.type} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

              {/* Section header */}
              <div className={`px-5 py-4 ${section.headerBg} border-b border-gray-100`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${section.dot}`} />
                    <div>
                      <h2 className={`text-sm font-bold ${section.accent}`}>{section.label}</h2>
                      <p className="text-xs text-gray-400 mt-0.5">{section.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 bg-white border border-gray-100 px-2 py-0.5 rounded-full">
                      {total}
                    </span>
                    <button
                      onClick={() => openNew(section.type)}
                      className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all hover:shadow-sm ${section.accent} border-current/30 hover:bg-white`}
                    >
                      <Plus size={11} /> Aggiungi
                    </button>
                  </div>
                </div>
              </div>

              {/* Category list */}
              <div className="divide-y divide-gray-50">
                {cats.map((cat: Category) => (
                  <div
                    key={cat.id}
                    className={`flex items-center gap-3 px-5 py-3 group transition-colors hover:bg-gray-50/80 ${
                      !cat.active ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-base shrink-0">
                      {cat.icon}
                    </div>
                    <span className={`flex-1 text-sm font-medium ${cat.active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                      {cat.name}
                    </span>

                    {/* Actions (visibili on hover) */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => toggleActive(cat)}
                        title={cat.active ? 'Disattiva' : 'Attiva'}
                        className={`p-1.5 rounded-lg text-xs transition-colors ${
                          cat.active
                            ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                            : 'text-emerald-500 hover:bg-emerald-50'
                        }`}
                      >
                        {cat.active ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      <button
                        onClick={() => openEdit(cat)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(cat.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}

                {cats.length === 0 && (
                  <div className="px-5 py-6 text-center">
                    <p className="text-xs text-gray-400 mb-2">Nessuna categoria attiva</p>
                    <button
                      onClick={() => openNew(section.type)}
                      className={`text-xs font-medium ${section.accent} hover:underline`}
                    >
                      + Crea la prima
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal crea/modifica */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b bg-gray-50 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {modal.editing ? 'Modifica categoria' : `Nuova categoria · ${sectionLabel[modal.type]}`}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Scegli un nome e un'icona rappresentativa</p>
              </div>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* Preview */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="w-10 h-10 bg-white rounded-xl border border-gray-200 flex items-center justify-center text-xl shadow-sm">
                  {form.icon}
                </div>
                <p className="font-medium text-gray-900 text-sm">{form.name || 'Nome categoria'}</p>
              </div>

              {/* Nome */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Nome</label>
                <input
                  type="text"
                  placeholder="Es. Consulenze, Affitto studio, Corsi…"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-gray-50"
                />
              </div>

              {/* Icona */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Icona</label>
                <div className="grid grid-cols-8 gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {ICON_OPTIONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setForm({ ...form, icon })}
                      className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center border transition-all hover:scale-110 ${
                        form.icon === icon
                          ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200 scale-110'
                          : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Oppure digita qualsiasi emoji nel nome ↑</p>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setModal(null)}
                  className="flex-1 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-xl hover:bg-gray-50 text-sm"
                >
                  Annulla
                </button>
                <button
                  onClick={handleSave}
                  disabled={!form.name}
                  className="flex-1 bg-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 text-sm transition-colors"
                >
                  {modal.editing ? 'Salva' : 'Crea categoria'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
