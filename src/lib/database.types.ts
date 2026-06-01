export type ProfileType = 'PERSONAL' | 'FREELANCE' | 'BOTH'
export type TaxRegime = 'FORFETTARIO_5' | 'FORFETTARIO_15' | 'ORDINARIO'
export type TransactionType = 'INCOME' | 'EXPENSES' | 'SAVINGS' | 'DEBTS'
export type CategoryType = TransactionType | 'BUSINESS_INCOME' | 'BUSINESS_EXPENSES'
export type BillPeriod = 'MONTHLY' | 'WEEKLY' | 'ANNUAL'
export type AccountType = 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD' | 'CASH' | 'INVESTMENT' | 'CRYPTO' | 'OTHER'

export interface BankAccount {
  id: string
  user_id: string
  name: string           // es. "Conto ING", "Carta Visa"
  bank_name: string      // es. "ING", "Fineco"
  type: AccountType
  color: string
  icon: string           // emoji
  balance: number        // saldo manuale (non calcolato)
  currency: string
  is_default: boolean
  notes: string | null
  created_at: string
}
export type InvoiceStatus = 'PAID' | 'PENDING' | 'OVERDUE'

export interface Profile {
  id: string
  name: string
  currency: string
  profile_type: ProfileType
  tax_regime: TaxRegime
  vat_threshold: number
  ateco_coefficient: number
  inps_regime: 'GESTIONE_SEPARATA' | 'IVS_ARTIGIANI' | 'IVS_COMMERCIANTI'
  inps_reduction_pct: number
  /** Solo per profili BOTH: stipendio annuo lordo da lavoro dipendente */
  stipendio_annuo_lordo: number
  created_at: string
}

export interface Category {
  id: string
  user_id: string
  name: string
  icon: string
  type: CategoryType
  active: boolean
  created_at: string
}

export interface BudgetPlan {
  id: string
  user_id: string
  category_id: string
  year: number
  month: number
  amount: number
  created_at: string
}

export interface Transaction {
  id: string
  user_id: string
  date: string
  type: TransactionType
  category_id: string
  description: string
  amount: number
  is_business: boolean
  activity_name: string | null
  account_id: string | null   // conto bancario di riferimento
  created_at: string
}

export interface Invoice {
  id: string
  user_id: string
  date_issued: string
  client_name: string
  amount_gross: number
  amount_net: number
  tax_amount: number
  inps_amount: number
  status: InvoiceStatus
  due_date: string
  activity_name: string | null
  fic_id: string | null
  created_at: string
}

export interface SavingGoal {
  id: string
  user_id: string
  category_id: string | null
  name: string
  icon: string
  color: string
  target_amount: number
  current_amount: number
  deadline: string | null
  year: number
  created_at: string
}

export interface RecurringBill {
  id: string
  user_id: string
  name: string
  category_id: string
  amount_due: number
  amount_paid: number
  period: BillPeriod
  day_of_month: number
  active: boolean
  auto_generate: boolean
  created_at: string
}

export interface Activity {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
}

export interface FicConnection {
  id: string
  user_id: string
  access_token: string
  refresh_token: string | null
  company_id: string
  company_name: string
  last_sync_at: string | null
  created_at: string
}

type TableDef<R, I = Partial<R>, U = Partial<R>> = {
  Row: R
  Insert: I
  Update: U
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles:        TableDef<Profile,        Omit<Profile, 'created_at'>>
      categories:      TableDef<Category,       Omit<Category, 'id' | 'created_at'>>
      budget_plans:    TableDef<BudgetPlan,     Omit<BudgetPlan, 'id' | 'created_at'>>
      transactions:    TableDef<Transaction,    Omit<Transaction, 'id' | 'created_at'>>
      invoices:        TableDef<Invoice,        Omit<Invoice, 'id' | 'created_at'>>
      saving_goals:    TableDef<SavingGoal,     Omit<SavingGoal, 'id' | 'created_at'>>
      recurring_bills: TableDef<RecurringBill,  Omit<RecurringBill, 'id' | 'created_at'>>
      activities:      TableDef<Activity,       Omit<Activity, 'id' | 'created_at'>>
      fic_connections:  TableDef<FicConnection,  Omit<FicConnection, 'id' | 'created_at'>>
      bank_accounts:    TableDef<BankAccount,    Omit<BankAccount, 'id' | 'created_at'>>
    }
    Views:            Record<string, never>
    Functions:        Record<string, never>
    Enums:            Record<string, never>
    CompositeTypes:   Record<string, never>
  }
}
