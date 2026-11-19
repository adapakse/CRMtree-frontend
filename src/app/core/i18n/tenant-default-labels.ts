// Dictionaries that are tenant data: seeded with default values when a tenant
// is created and editable by its admin afterwards. The stored text is what the
// API sends and compares, so it never changes; only a value that is exactly a
// seeded default is shown translated. Anything the tenant typed itself is shown
// as stored.
//
// The tables hold the stored texts on purpose (Polish, and for the project
// dictionaries every language the backend seeds them in — see
// CRMtree-backend src/i18n/projectDefaults and projectConfigService.seedDefaults).
// That is why this file is not listed in src/i18n/translated-files.json.
// Translations: scope `common`, key `tenantDefaults.<dictionary>.<slug>`.

export type TenantDictionary =
  | 'projectStatuses'
  | 'projectTypes'
  | 'projectPriorities'
  | 'projectCostCategories'
  | 'holdReasons'
  | 'lostReasons'
  | 'countries'
  | 'languages'
  | 'contractSubjects'
  | 'consentLabels'
  | 'consentDescriptions'
  | 'groups'
  | 'groupDescriptions';

/** Slug → every stored text that means that seeded default. */
export const TENANT_DEFAULT_VALUES: Record<TenantDictionary, Record<string, string[]>> = {
  projectStatuses: {
    todo: ['Do zrobienia', 'To do', 'Zu erledigen', 'Da fare', 'Por hacer', 'À faire', 'De făcut', 'К выполнению', 'Za izvedbo', 'Za napraviti'],
    inProgress: ['W toku', 'In progress', 'In Bearbeitung', 'In corso', 'En curso', 'En cours', 'În lucru', 'В работе', 'V teku', 'U tijeku'],
    review: ['Do weryfikacji', 'In review', 'Zur Prüfung', 'Da verificare', 'En revisión', 'À vérifier', 'De verificat', 'На проверке', 'V pregledu', 'Na provjeri'],
    // „Выполнено” is the Russian name used on production next to the backend's „Завершено”.
    done: ['Zakończone', 'Done', 'Abgeschlossen', 'Completato', 'Completado', 'Terminé', 'Finalizat', 'Завершено', 'Выполнено', 'Zaključeno', 'Završeno'],
  },
  projectTypes: {
    task: ['Zadanie', 'Task', 'Aufgabe', 'Attività', 'Tarea', 'Tâche', 'Sarcină', 'Задача', 'Naloga', 'Zadatak'],
    meeting: ['Spotkanie', 'Meeting', 'Besprechung', 'Riunione', 'Reunión', 'Réunion', 'Întâlnire', 'Встреча', 'Sestanek', 'Sastanak'],
    milestone: ['Kamień milowy', 'Milestone', 'Meilenstein', 'Traguardo', 'Hito', 'Jalon', 'Reper', 'Веха', 'Mejnik', 'Prekretnica'],
  },
  projectPriorities: {
    low: ['Niski', 'Low', 'Niedrig', 'Bassa', 'Baja', 'Faible', 'Scăzută', 'Низкий', 'Nizka'],
    medium: ['Średni', 'Medium', 'Mittel', 'Media', 'Moyenne', 'Medie', 'Средний', 'Srednja', 'Srednji'],
    high: ['Wysoki', 'High', 'Hoch', 'Alta', 'Haute', 'Ridicată', 'Высокий', 'Visoka', 'Visoki'],
    critical: ['Krytyczny', 'Critical', 'Kritisch', 'Critica', 'Crítica', 'Critique', 'Critică', 'Критический', 'Kritična', 'Kritični'],
  },
  projectCostCategories: {
    ownWork: ['Praca własna', 'Own work', 'Eigenleistung', 'Lavoro interno', 'Trabajo propio', 'Travail interne', 'Muncă proprie', 'Собственная работа', 'Lastno delo', 'Vlastiti rad'],
    subcontractors: ['Podwykonawcy', 'Subcontractors', 'Subunternehmer', 'Subappaltatori', 'Subcontratistas', 'Sous-traitants', 'Subcontractori', 'Субподрядчики', 'Podizvajalci', 'Podizvođači'],
    materials: ['Materiały', 'Materials', 'Material', 'Materiali', 'Materiales', 'Matériaux', 'Materiale', 'Материалы', 'Materijali'],
    licences: ['Licencje', 'Licences', 'Lizenzen', 'Licenze', 'Licencias', 'Licențe', 'Лицензии', 'Licence'],
    travel: ['Podróże', 'Travel', 'Reisen', 'Viaggi', 'Viajes', 'Déplacements', 'Deplasări', 'Командировки', 'Potovanja', 'Putovanja'],
    other: ['Inne', 'Other', 'Sonstiges', 'Altro', 'Otros', 'Autres', 'Altele', 'Прочее', 'Drugo', 'Ostalo'],
  },
  // app_settings, migration 0294.
  holdReasons: {
    internalSituation: ['Sytuacja wewnątrz firmy'],
    noDecisionMakers: ['Brak osób decyzyjnych'],
    businessPause: ['Przerwa w działalności'],
  },
  // app_settings, migration 0137.
  lostReasons: {
    highPrice: ['Wysoka cena'],
    incompleteOffer: ['Niepełna oferta'],
    other: ['Inne'],
  },
  // app_settings crm_partner_countries, migration 0123 (also the documents' fallback list).
  countries: {
    pl: ['Polska'], de: ['Niemcy'], fr: ['Francja'], gb: ['Wielka Brytania'], cz: ['Czechy'],
    sk: ['Słowacja'], hu: ['Węgry'], ro: ['Rumunia'], ua: ['Ukraina'], ru: ['Rosja'],
    at: ['Austria'], ch: ['Szwajcaria'], it: ['Włochy'], es: ['Hiszpania'], nl: ['Holandia'],
    be: ['Belgia'], se: ['Szwecja'], no: ['Norwegia'], dk: ['Dania'], fi: ['Finlandia'],
  },
  // app_settings crm_partner_languages, migration 0123.
  languages: {
    pl: ['Polski'], en: ['Angielski'], ru: ['Rosyjski'], ro: ['Rumuński'], de: ['Niemiecki'],
  },
  // app_settings doc_contract_subjects, migration 0126 (also the documents' fallback list).
  contractSubjects: {
    businessTravel: ['Podróże służbowe'],
    conferences: ['Konferencje/Spotkania'],
    accommodation: ['Zakwaterowanie'],
    system: ['System'],
    other: ['Inne'],
  },
  // app_settings crm.consent_types, migration 0194.
  consentLabels: {
    marketingComm: ['Zgoda na przetwarzanie danych w celu komunikacji marketingowej'],
    classificationTargeting: ['Zgoda na przetwarzanie w celu klasyfikacji oraz targetowania'],
  },
  consentDescriptions: {
    marketingComm: ['Zgoda na przetwarzanie danych osobowych kontaktu w celu przesyłania materiałów marketingowych, ofert oraz informacji o produktach i usługach drogą elektroniczną i telefoniczną, zgodnie z art. 6 ust. 1 lit. a RODO.'],
    classificationTargeting: ['Zgoda na profilowanie, klasyfikację oraz targetowanie na podstawie danych o aktywności i zachowaniach zakupowych partnera, w celu personalizacji ofert handlowych i działań sprzedażowych, zgodnie z art. 6 ust. 1 lit. a RODO.'],
  },
  // group_profiles.display_name, migrations 0127, 0249, 0303. The technical
  // names (`Sprzedaz`, `Zarzad`) stand in where a group has no display name.
  // Matched by display name, not by `name`: two groups share the name `SEO`.
  groups: {
    accounting: ['Accounting'],
    hr: ['HR'],
    marketing: ['Marketing'],
    customerService: ['Obsługa Klienta'],
    operations: ['Operations'],
    sales: ['Sprzedaż', 'Sprzedaz'],
    management: ['Zarząd', 'Zarzad'],
    prospects: ['Prospekty'],
    seoEditorial: ['Redakcja SEO'],
  },
  groupDescriptions: {
    accounting: ['Dział finansów i księgowości'],
    hr: ['Dział kadr i zasobów ludzkich'],
    marketing: ['Dział marketingu'],
    customerService: ['Dział obsługi klienta'],
    operations: ['Dział operacyjny'],
    sales: ['Dział sprzedaży'],
    management: ['Zarząd firmy'],
    prospects: ['Dostęp do modułu Prospektów (import CSV, enrichment, konwersja na lead).'],
    seo: ['Przegląd i akceptacja treści SEObota przed publikacją.'],
    seoEditorial: ['Redaktorzy SEObota: edycja, uzupełnianie i akceptacja artykułów przed publikacją.'],
  },
};

const SLUG_BY_VALUE = Object.fromEntries(
  Object.entries(TENANT_DEFAULT_VALUES).map(([dictionary, slugs]) => [
    dictionary,
    new Map(Object.entries(slugs).flatMap(([slug, values]) => values.map(value => [value, slug] as const))),
  ]),
) as Record<TenantDictionary, Map<string, string>>;

/**
 * Translation key (scope `common`) of a stored dictionary value that is a
 * seeded default, or null for a value the tenant defined itself.
 */
export function tenantDefaultLabelKey(dictionary: TenantDictionary, value: string | null | undefined): string | null {
  if (!value) return null;
  const slug = SLUG_BY_VALUE[dictionary].get(value);
  return slug ? `tenantDefaults.${dictionary}.${slug}` : null;
}

export const TENANT_DICTIONARIES = Object.keys(TENANT_DEFAULT_VALUES) as TenantDictionary[];
