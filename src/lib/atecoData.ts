/**
 * Coefficienti di redditività del Regime Forfettario
 * Fonte: Legge 190/2014, Allegato 4 (aggiornato)
 *
 * coefficient = imponibile / fatturato lordo
 */

export interface AtecoGroup {
  coefficient: number           // es. 0.78
  label: string                 // Nome del gruppo (Legge 190/2014)
  description: string           // Spiegazione human-friendly
  examples: string[]            // Professioni/attività tipiche
  codes: string[]               // Prefissi ATECO 2007 inclusi
}

export const ATECO_GROUPS: AtecoGroup[] = [
  {
    coefficient: 0.40,
    label: 'Commercio al dettaglio & ristorazione',
    description: 'Vendita di prodotti fisici al pubblico, bar, ristoranti, hotel',
    examples: ['Negozio al dettaglio', 'Bar / Ristorante', 'Hotel / B&B', 'Industria alimentare', 'Commercio ambulante alimentare'],
    codes: ['10','11','45','46.2','46.3','46.4','46.5','46.6','46.7','46.8','46.9','47.1','47.2','47.3','47.4','47.5','47.6','47.7','47.81','55','56'],
  },
  {
    coefficient: 0.54,
    label: 'Commercio ambulante altri prodotti',
    description: 'Vendita ambulante di prodotti non alimentari',
    examples: ['Mercato / Bancarella', 'Vendita ambulante abbigliamento', 'Vendita ambulante elettronica'],
    codes: ['47.82','47.89'],
  },
  {
    coefficient: 0.62,
    label: 'Intermediari del commercio',
    description: 'Agenti e rappresentanti di commercio',
    examples: ['Agente di commercio', 'Rappresentante', 'Mediatore commerciale', 'Procacciatore di affari'],
    codes: ['46.1'],
  },
  {
    coefficient: 0.67,
    label: 'Altre attività economiche',
    description: 'Attività manifatturiere, ICT, servizi generali, artigianato',
    examples: [
      'Sviluppatore software / Web developer',
      'Informatico / IT Consultant',
      'Grafico / Web designer',
      'Social media manager',
      'Videomaker / Fotografo',
      'Artigiano',
      'Meccanico / Elettricista / Idraulico',
      'Traduttore / Interprete',
      'Parrucchiere / Estetista',
      'Personal trainer',
    ],
    codes: ['01','02','03','05','06','07','08','09','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33','35','36','37','38','39','49','50','51','52','53','58','59','60','61','62','63','77','78','79','80','81','82','90','91','92','93','94','95','96','97','98','99'],
  },
  {
    coefficient: 0.78,
    label: 'Professionisti, consulenti, attività sanitarie e di istruzione',
    description: 'Attività intellettuali, professionali e di servizi qualificati',
    examples: [
      'Copywriter / Redattore',
      'Advertiser / Consulente marketing',
      'Avvocato / Notaio',
      'Commercialista / Consulente fiscale',
      'Medico / Dentista / Psicologo',
      'Architetto / Ingegnere',
      'Coach / Formatore / Docente',
      'Consulente aziendale / Management',
      'Financial advisor',
      'Giornalista / Ufficio stampa',
    ],
    codes: ['64','65','66','69','70','71','72','73','74','75','85','86','87','88'],
  },
  {
    coefficient: 0.86,
    label: 'Costruzioni e attività immobiliari',
    description: 'Edilizia, ristrutturazioni, agenzie immobiliari',
    examples: ['Impresa edile', 'Ristrutturazioni', 'Agente immobiliare', 'Geometra', 'Impiantista'],
    codes: ['41','42','43','68'],
  },
]

/** Cerca un gruppo ATECO per codice (es. "73.11" → gruppo 78%) */
export function findGroupByCode(code: string): AtecoGroup | null {
  const clean = code.replace(/\s/g, '').toUpperCase()
  // Prova match esatto, poi da più specifico a meno specifico
  for (const group of ATECO_GROUPS) {
    for (const prefix of group.codes) {
      if (clean.startsWith(prefix.replace('.','').toUpperCase()) || clean === prefix.replace('.','').toUpperCase()) {
        return group
      }
    }
  }
  return null
}

/** Cerca gruppi per parola chiave nell'attività */
export function searchGroups(query: string): AtecoGroup[] {
  if (!query.trim()) return ATECO_GROUPS
  const q = query.toLowerCase()
  return ATECO_GROUPS.filter(
    (g) =>
      g.label.toLowerCase().includes(q) ||
      g.description.toLowerCase().includes(q) ||
      g.examples.some((e) => e.toLowerCase().includes(q))
  )
}

/** Codici ATECO più comuni con label — per ricerca rapida */
export const COMMON_ATECO: { code: string; label: string; coefficient: number }[] = [
  // 78%
  { code: '74.10', label: 'Attività di design (grafico, moda, interni)', coefficient: 0.78 },
  { code: '73.11', label: 'Pubblicità e comunicazione', coefficient: 0.78 },
  { code: '73.12', label: 'Media planning / Consulenza media', coefficient: 0.78 },
  { code: '70.22', label: 'Consulenza aziendale / Management consulting', coefficient: 0.78 },
  { code: '69.20', label: 'Commercialista / Contabilità / Revisione', coefficient: 0.78 },
  { code: '69.10', label: 'Attività legali (avvocato, notaio)', coefficient: 0.78 },
  { code: '71.11', label: 'Architettura', coefficient: 0.78 },
  { code: '71.12', label: 'Ingegneria / Progettazione', coefficient: 0.78 },
  { code: '72.20', label: 'Ricerca e sviluppo / Scienze sociali', coefficient: 0.78 },
  { code: '74.30', label: 'Traduzione e interpretariato', coefficient: 0.78 },
  { code: '74.90', label: 'Altre attività professionali (coach, formatore…)', coefficient: 0.78 },
  { code: '85.59', label: 'Docente / Formazione professionale / Corsi', coefficient: 0.78 },
  { code: '86.21', label: 'Medico di base / Pediatra', coefficient: 0.78 },
  { code: '86.90', label: 'Psicologo / Fisioterapista / Logopedista', coefficient: 0.78 },
  // 67%
  { code: '62.01', label: 'Sviluppo software / Programmatore', coefficient: 0.67 },
  { code: '62.02', label: 'Consulenza IT / Sistemista', coefficient: 0.67 },
  { code: '63.11', label: 'Elaborazione dati / Cloud / SaaS', coefficient: 0.67 },
  { code: '59.11', label: 'Produzione video / Cinema', coefficient: 0.67 },
  { code: '59.20', label: 'Produzione musicale / Podcast', coefficient: 0.67 },
  { code: '90.01', label: 'Attività artistiche (musicista, attore…)', coefficient: 0.67 },
  { code: '74.20', label: 'Fotografo / Fotoreporter', coefficient: 0.67 },
  { code: '96.02', label: 'Parrucchiere / Barbiere', coefficient: 0.67 },
  { code: '96.04', label: 'Estetista / Centro benessere', coefficient: 0.67 },
  { code: '93.13', label: 'Personal trainer / Palestra', coefficient: 0.67 },
  // 62%
  { code: '46.19', label: 'Agente / Rappresentante di commercio', coefficient: 0.62 },
  // 40%
  { code: '56.10', label: 'Ristorante / Trattoria', coefficient: 0.40 },
  { code: '56.30', label: 'Bar / Caffetteria', coefficient: 0.40 },
  { code: '55.10', label: 'Hotel / B&B', coefficient: 0.40 },
]
