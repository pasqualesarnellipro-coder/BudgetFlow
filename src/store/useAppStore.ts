import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Profile } from '@/lib/database.types'
import type { Language, TranslationKey } from '@/lib/i18n'
import { t as translate } from '@/lib/i18n'

interface AppState {
  profile: Profile | null
  selectedYear: number
  selectedMonth: number
  language: Language
  darkMode: boolean
  setProfile: (profile: Profile | null) => void
  setSelectedYear: (year: number) => void
  setSelectedMonth: (month: number) => void
  setLanguage: (language: Language) => void
  toggleDarkMode: () => void
  t: (key: TranslationKey) => string
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      profile: null,
      selectedYear: new Date().getFullYear(),
      selectedMonth: new Date().getMonth() + 1,
      language: 'it' as Language,
      darkMode: false,
      setProfile: (profile) => set({ profile }),
      setSelectedYear: (selectedYear) => set({ selectedYear }),
      setSelectedMonth: (selectedMonth) => set({ selectedMonth }),
      setLanguage: (language) => set({ language }),
      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
      t: (key: TranslationKey) => translate(get().language, key),
    }),
    {
      name: 'budgetflow-prefs',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ language: state.language, darkMode: state.darkMode }),
    }
  )
)
