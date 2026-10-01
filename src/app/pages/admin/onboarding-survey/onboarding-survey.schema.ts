// Single definition of the tenant onboarding survey. Both the page the tenant
// admin fills in and the read-only view super admins open in Tenants render
// from it, so a question is added in exactly one place. The backend stores a
// flat key → value map and knows nothing about these fields, except that
// `secret` fields travel in a separate, encrypted map.

export type SurveyAnswerValue = string | string[];
export type SurveyAnswers = Record<string, SurveyAnswerValue>;

export type SurveyFieldType =
  | 'text' | 'textarea' | 'email' | 'tel' | 'number' | 'date'
  | 'select' | 'checkboxes' | 'secret';

export interface SurveyOption {
  value: string;
  label: string;
  hint?: string;
}

export interface SurveyField {
  key: string;
  label: string;
  type: SurveyFieldType;
  hint?: string;
  placeholder?: string;
  options?: SurveyOption[];
  isRequired?: boolean;
  isVisible?: (answers: SurveyAnswers) => boolean;
}

export interface SurveySection {
  id: string;
  title: string;
  intro?: string;
  fields: SurveyField[];
  isVisible?: (answers: SurveyAnswers) => boolean;
}

export interface OnboardingSurveyResponse {
  status: 'not_started' | 'draft' | 'submitted';
  answers: SurveyAnswers;
  configured_secret_keys: string[];
  submitted_at: string | null;
  submitted_by_name: string | null;
  updated_at: string | null;
  secrets?: Record<string, string | null>;
}

const isAnswer = (key: string, value: string) => (answers: SurveyAnswers) => answers[key] === value;
const isAnyOf = (key: string, values: string[]) => (answers: SurveyAnswers) => values.includes(answers[key] as string);
const hasModule = (module: string) => (answers: SurveyAnswers) => {
  const modules = answers['modules'];
  return Array.isArray(modules) && modules.includes(module);
};
const hasAnyModule = (...modules: string[]) => (answers: SurveyAnswers) => modules.some(m => hasModule(m)(answers));

const YES_NO: SurveyOption[] = [
  { value: 'yes', label: 'Tak' },
  { value: 'no', label: 'Nie' },
];

const OAUTH_APP_OWNER: SurveyOption[] = [
  { value: 'client', label: 'Nasz dział IT zarejestruje aplikację i poda dane poniżej' },
  { value: 'needs_help', label: 'Potrzebujemy pomocy CRMtree przy rejestracji aplikacji' },
];

const AI_LICENCE: SurveyOption[] = [
  { value: 'shared', label: 'Licencja CRMtree (współdzielona, rozliczana w ramach umowy)' },
  { value: 'own', label: 'Własna, dedykowana licencja / klucz API naszej firmy' },
  { value: 'undecided', label: 'Jeszcze nie wiemy — prosimy o rekomendację' },
];

export const ONBOARDING_SURVEY_SECTIONS: SurveySection[] = [
  {
    id: 'company',
    title: '1. Firma i osoby kontaktowe',
    intro: 'Podstawowe informacje, na podstawie których przygotujemy środowisko i ustalimy, z kim kontaktować się w trakcie wdrożenia.',
    fields: [
      { key: 'company_display_name', label: 'Nazwa firmy widoczna w CRM', type: 'text', isRequired: true, placeholder: 'np. Acme' },
      { key: 'company_email_domain', label: 'Domena firmowej poczty e-mail', type: 'text', placeholder: 'np. acme.pl', hint: 'Domena, z której logują się Państwa pracownicy.' },
      { key: 'company_industry', label: 'Branża', type: 'text', placeholder: 'np. logistyka, IT, produkcja' },
      { key: 'company_offer_description', label: 'Co Państwo sprzedają i komu?', type: 'textarea', hint: 'Krótki opis oferty i typowego klienta. Wykorzystujemy go do ustawienia słowników oraz podpowiedzi AI.' },
      { key: 'business_contact_name', label: 'Osoba decyzyjna po stronie biznesu — imię i nazwisko', type: 'text', isRequired: true },
      { key: 'business_contact_email', label: 'Osoba decyzyjna — e-mail', type: 'email', isRequired: true },
      { key: 'business_contact_phone', label: 'Osoba decyzyjna — telefon', type: 'tel' },
      { key: 'technical_contact_name', label: 'Osoba techniczna (IT) — imię i nazwisko', type: 'text', hint: 'Osoba, która ma dostęp administratora do poczty, telefonii i kont Meta.' },
      { key: 'technical_contact_email', label: 'Osoba techniczna — e-mail', type: 'email' },
      { key: 'technical_contact_phone', label: 'Osoba techniczna — telefon', type: 'tel' },
      { key: 'go_live_date', label: 'Planowana data uruchomienia', type: 'date' },
    ],
  },
  {
    id: 'billing',
    title: '2. Plan i dane do faktury',
    fields: [
      {
        key: 'billing_plan', label: 'Wybrany plan', type: 'select', isRequired: true,
        options: [
          { value: 'lite', label: 'Lite' },
          { value: 'standard', label: 'Standard' },
          { value: 'professional', label: 'Professional (wycena indywidualna)' },
          { value: 'undecided', label: 'Do ustalenia' },
        ],
      },
      {
        key: 'billing_cycle', label: 'Cykl rozliczeniowy', type: 'select',
        options: [
          { value: 'monthly', label: 'Miesięczny' },
          { value: 'annual', label: 'Roczny' },
        ],
      },
      { key: 'billing_company_name', label: 'Pełna nazwa firmy (do faktury)', type: 'text', isRequired: true, placeholder: 'np. Acme Sp. z o.o.' },
      { key: 'billing_nip', label: 'NIP', type: 'text', isRequired: true },
      { key: 'billing_street', label: 'Ulica i numer', type: 'text' },
      { key: 'billing_postal_code', label: 'Kod pocztowy', type: 'text' },
      { key: 'billing_city', label: 'Miasto', type: 'text' },
      { key: 'billing_country', label: 'Kraj', type: 'text', placeholder: 'Polska' },
      { key: 'billing_invoice_email', label: 'E-mail, na który wysyłamy faktury', type: 'email', placeholder: 'ksiegowosc@firma.pl' },
    ],
  },
  {
    id: 'users',
    title: '3. Użytkownicy i role',
    fields: [
      { key: 'users_count', label: 'Planowana liczba użytkowników', type: 'number', isRequired: true },
      {
        key: 'users_list', label: 'Lista użytkowników do założenia', type: 'textarea',
        placeholder: 'Jan Kowalski; jan.kowalski@firma.pl; handlowiec\nAnna Nowak; anna.nowak@firma.pl; manager sprzedaży',
        hint: 'Jedna osoba w wierszu: imię i nazwisko; e-mail; rola (administrator / manager sprzedaży / handlowiec). Każdy dostanie jednorazowe hasło do zmiany przy pierwszym logowaniu.',
      },
      { key: 'users_team_structure', label: 'Struktura zespołów sprzedaży', type: 'textarea', hint: 'Jakie są zespoły / regiony i kto komu podlega. Na tej podstawie ustawimy grupy i widoczność danych.' },
      {
        key: 'users_global_read', label: 'Czy handlowcy mają widzieć leady i klientów innych handlowców?', type: 'select',
        options: [
          { value: 'own_only', label: 'Nie — każdy widzi tylko swoje' },
          { value: 'read_all', label: 'Tak — wszyscy widzą wszystko (tylko odczyt)' },
          { value: 'undecided', label: 'Do ustalenia' },
        ],
      },
    ],
  },
  {
    id: 'modules',
    title: '4. Moduły',
    intro: 'Zaznaczone moduły włączymy w Państwa środowisku. Dla części z nich niżej pojawią się dodatkowe pytania.',
    fields: [
      {
        key: 'modules', label: 'Które moduły mają być aktywne?', type: 'checkboxes', isRequired: true,
        options: [
          { value: 'leads', label: 'Leady', hint: 'Lejek sprzedażowy, aktywności, kalendarz.' },
          { value: 'partner_registry', label: 'Rejestr partnerów / klientów', hint: 'Obsługa obecnych klientów, upsell i cross-sell.' },
          { value: 'sales_reports', label: 'Raporty sprzedaży' },
          { value: 'performance', label: 'Performance', hint: 'Health score i ryzyko odejścia klienta (churn).' },
          { value: 'onboarding', label: 'Onboarding klientów', hint: 'Szablony zadań wdrożeniowych dla nowych klientów.' },
          { value: 'documents', label: 'Dokumenty', hint: 'Rejestr umów, obieg akceptacji i podpis.' },
          { value: 'prospects', label: 'Prospekty', hint: 'Wyszukiwanie firm i ich automatyczna ocena przez AI (Enrichment / ICP).' },
          { value: 'pbx', label: 'Telefonia (softphone)', hint: 'Dzwonienie do klientów bezpośrednio z CRM.' },
          { value: 'call_analysis', label: 'Analiza rozmów', hint: 'Ocena rozmów telefonicznych przez AI.' },
          { value: 'whatsapp', label: 'WhatsApp', hint: 'Wspólny firmowy numer WhatsApp Business obsługiwany z kart leadów i klientów.' },
          { value: 'seo_bot', label: 'SEObot', hint: 'Automatyczne tworzenie i publikacja artykułów na blogu.' },
          { value: 'dwh_integration', label: 'Integracja z danymi sprzedażowymi (DWH)', hint: 'Zasilanie CRM obrotami z Państwa systemu sprzedażowego / ERP.' },
        ],
      },
    ],
  },
  {
    id: 'email',
    title: '5. Poczta e-mail',
    intro: 'Każdy użytkownik łączy w CRM własną skrzynkę (wysyłka i odbiór wiadomości na kartach leadów i klientów). Wymaga to jednorazowej rejestracji aplikacji u dostawcy poczty — adres zwrotny (Redirect URI) przekażemy osobie technicznej.',
    fields: [
      {
        key: 'email_provider', label: 'Z jakiej poczty firmowej Państwo korzystają?', type: 'select', isRequired: true,
        options: [
          { value: 'gmail', label: 'Gmail / Google Workspace' },
          { value: 'outlook', label: 'Outlook / Microsoft 365' },
          { value: 'zoho', label: 'Zoho Mail' },
          { value: 'other', label: 'Inna' },
          { value: 'none', label: 'Nie chcemy integracji poczty' },
        ],
      },
      { key: 'email_other_provider', label: 'Jaka to poczta?', type: 'text', isVisible: isAnswer('email_provider', 'other'), hint: 'Obecnie obsługujemy Gmail, Microsoft 365 i Zoho — sprawdzimy możliwości dla innego dostawcy.' },
      { key: 'email_mailbox_count', label: 'Ile skrzynek będzie podłączonych?', type: 'number', isVisible: isAnyOf('email_provider', ['gmail', 'outlook', 'zoho']) },
      { key: 'email_oauth_app_owner', label: 'Kto zarejestruje aplikację u dostawcy poczty?', type: 'select', options: OAUTH_APP_OWNER, isVisible: isAnyOf('email_provider', ['gmail', 'outlook', 'zoho']) },

      { key: 'gmail_client_id', label: 'Google — Client ID', type: 'text', placeholder: '123456789.apps.googleusercontent.com', isVisible: isAnswer('email_provider', 'gmail') },
      { key: 'gmail_client_secret', label: 'Google — Client Secret', type: 'secret', isVisible: isAnswer('email_provider', 'gmail') },
      { key: 'gmail_pubsub_topic', label: 'Google — Pub/Sub Topic', type: 'text', placeholder: 'projects/moj-projekt/topics/gmail-push', hint: 'Potrzebny do natychmiastowego odbioru nowych wiadomości.', isVisible: isAnswer('email_provider', 'gmail') },

      { key: 'outlook_client_id', label: 'Microsoft — Application (client) ID', type: 'text', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', isVisible: isAnswer('email_provider', 'outlook') },
      { key: 'outlook_client_secret', label: 'Microsoft — Client Secret', type: 'secret', isVisible: isAnswer('email_provider', 'outlook') },
      { key: 'outlook_azure_tenant_id', label: 'Microsoft — Directory (tenant) ID', type: 'text', hint: 'Opcjonalne.', isVisible: isAnswer('email_provider', 'outlook') },
      { key: 'outlook_admin_consent', label: 'Czy administrator Microsoft 365 może udzielić zgody (admin consent) dla całej organizacji?', type: 'select', options: YES_NO, isVisible: isAnswer('email_provider', 'outlook') },

      { key: 'zoho_client_id', label: 'Zoho — Client ID', type: 'text', placeholder: '1000.XXXXXXXX', isVisible: isAnswer('email_provider', 'zoho') },
      { key: 'zoho_client_secret', label: 'Zoho — Client Secret', type: 'secret', isVisible: isAnswer('email_provider', 'zoho') },
      {
        key: 'zoho_data_center', label: 'Zoho — centrum danych', type: 'select', isVisible: isAnswer('email_provider', 'zoho'),
        options: [
          { value: 'eu', label: 'EU (zoho.eu)' },
          { value: 'com', label: 'US (zoho.com)' },
          { value: 'other', label: 'Inne' },
        ],
      },
    ],
  },
  {
    id: 'whatsapp',
    title: '6. WhatsApp Business',
    intro: 'CRM obsługuje jeden wspólny firmowy numer WhatsApp Business dla całej organizacji (Meta WhatsApp Business Platform). Numer podłączony do CRM nie może jednocześnie działać w zwykłej aplikacji WhatsApp na telefonie.',
    isVisible: hasModule('whatsapp'),
    fields: [
      {
        key: 'whatsapp_number_status', label: 'Czy mają Państwo numer do WhatsApp Business?', type: 'select', isRequired: true,
        options: [
          { value: 'ready', label: 'Tak — numer jest już w Meta WhatsApp Business Platform (Cloud API)' },
          { value: 'has_number', label: 'Mamy numer, ale nie jest jeszcze zarejestrowany w Meta' },
          { value: 'needs_number', label: 'Nie — prosimy o zakup i konfigurację numeru przez CRMtree' },
        ],
      },
      { key: 'whatsapp_phone_number', label: 'Numer telefonu', type: 'tel', placeholder: '+48 600 000 000', isVisible: isAnyOf('whatsapp_number_status', ['ready', 'has_number']) },
      { key: 'whatsapp_display_name', label: 'Nazwa wyświetlana klientom w WhatsApp', type: 'text' },
      { key: 'whatsapp_meta_verified', label: 'Czy firma jest zweryfikowana w Meta Business Manager?', type: 'select', options: [...YES_NO, { value: 'unknown', label: 'Nie wiem' }] },
      { key: 'whatsapp_waba_id', label: 'WABA ID (WhatsApp Business Account ID)', type: 'text', hint: 'Meta App Dashboard → WhatsApp → API Setup.', isVisible: isAnswer('whatsapp_number_status', 'ready') },
      { key: 'whatsapp_phone_number_id', label: 'Phone Number ID', type: 'text', hint: 'To identyfikator numeru w Meta, nie sam numer telefonu.', isVisible: isAnswer('whatsapp_number_status', 'ready') },
      { key: 'whatsapp_access_token', label: 'Access Token (stały token użytkownika systemowego)', type: 'secret', hint: 'Uprawnienia: whatsapp_business_messaging, whatsapp_business_management.', isVisible: isAnswer('whatsapp_number_status', 'ready') },
      { key: 'whatsapp_app_secret', label: 'App Secret', type: 'secret', hint: 'Meta App Dashboard → Settings → Basic.', isVisible: isAnswer('whatsapp_number_status', 'ready') },
    ],
  },
  {
    id: 'pbx',
    title: '7. Telefonia (softphone)',
    intro: 'Softphone w CRM działa z wirtualną centralą ip-pbx.eu. Każdy użytkownik wpisuje później swój osobisty token w „Moje ustawienia” — tutaj nie trzeba go podawać.',
    isVisible: hasModule('pbx'),
    fields: [
      {
        key: 'pbx_account_status', label: 'Czy mają Państwo konto firmowe w ip-pbx.eu?', type: 'select', isRequired: true,
        options: [
          { value: 'has_account', label: 'Tak' },
          { value: 'other_provider', label: 'Nie — korzystamy z innej centrali / operatora' },
          { value: 'needs_account', label: 'Nie — prosimy o założenie konta przez CRMtree' },
        ],
      },
      { key: 'pbx_account_name', label: 'Nazwa firmy / konta w ip-pbx.eu', type: 'text', isVisible: isAnswer('pbx_account_status', 'has_account') },
      { key: 'pbx_current_provider', label: 'Obecna centrala / operator', type: 'text', isVisible: isAnswer('pbx_account_status', 'other_provider') },
      { key: 'pbx_extension_count', label: 'Ile osób będzie dzwonić z CRM?', type: 'number' },
      { key: 'pbx_phone_numbers', label: 'Numery, z których mają wychodzić połączenia', type: 'textarea', hint: 'Numer główny firmy oraz numery bezpośrednie, jeśli mają być przypisane do konkretnych osób. Zaznacz numery do przeniesienia od obecnego operatora.' },
      { key: 'pbx_call_recording', label: 'Czy rozmowy mają być nagrywane?', type: 'select', options: YES_NO, hint: 'Nagrania i ich transkrypcje są podstawą modułu Analiza rozmów.' },
    ],
  },
  {
    id: 'ai',
    title: '8. Modele AI — Enrichment i Analiza rozmów',
    intro: 'Moduły Prospekty (Enrichment) i Analiza rozmów wysyłają dane do zewnętrznych modeli językowych. Można korzystać z licencji CRMtree albo z własnej, dedykowanej licencji Państwa firmy.',
    isVisible: hasAnyModule('prospects', 'call_analysis'),
    fields: [
      {
        key: 'enrichment_model', label: 'Enrichment — preferowany model', type: 'select', isVisible: hasModule('prospects'),
        options: [
          { value: 'deepseek', label: 'DeepSeek (domyślny, niższy koszt)' },
          { value: 'anthropic', label: 'Anthropic Claude (wyższa jakość, wyższy koszt)' },
          { value: 'undecided', label: 'Prosimy o rekomendację' },
        ],
      },
      { key: 'enrichment_licence', label: 'Enrichment — licencja na model', type: 'select', options: AI_LICENCE, isRequired: true, isVisible: hasModule('prospects') },
      { key: 'enrichment_api_key', label: 'Enrichment — własny klucz API', type: 'secret', isVisible: answers => hasModule('prospects')(answers) && isAnswer('enrichment_licence', 'own')(answers) },
      { key: 'enrichment_monthly_volume', label: 'Enrichment — ile firm miesięcznie planują Państwo analizować?', type: 'number', isVisible: hasModule('prospects') },
      {
        key: 'enrichment_ideal_customer', label: 'Enrichment — profil idealnego klienta (ICP)', type: 'textarea', isVisible: hasModule('prospects'),
        hint: 'Branże, wielkość firmy, region, sygnały świadczące o dopasowaniu oraz firmy, których nie chcą Państwo pozyskiwać. Na tej podstawie skonfigurujemy sygnały i punktację.',
      },

      { key: 'call_analysis_licence', label: 'Analiza rozmów — licencja na model', type: 'select', options: AI_LICENCE, isRequired: true, isVisible: hasModule('call_analysis'), hint: 'Analiza rozmów korzysta z modelu DeepSeek.' },
      { key: 'call_analysis_api_key', label: 'Analiza rozmów — własny klucz API', type: 'secret', isVisible: answers => hasModule('call_analysis')(answers) && isAnswer('call_analysis_licence', 'own')(answers) },
      { key: 'call_analysis_monthly_volume', label: 'Analiza rozmów — szacowana liczba rozmów miesięcznie', type: 'number', isVisible: hasModule('call_analysis') },
      {
        key: 'call_analysis_buying_signals', label: 'Analiza rozmów — po czym poznają Państwo klienta gotowego do zakupu?', type: 'textarea', isVisible: hasModule('call_analysis'),
        hint: 'Typowe sygnały zainteresowania i typowe obiekcje. Dopasujemy do nich ocenę skłonności do zakupu.',
      },

      { key: 'ai_monthly_budget', label: 'Miesięczny limit kosztów modeli AI', type: 'text', placeholder: 'np. 200 EUR', hint: 'Opcjonalnie — jeśli chcą Państwo ograniczyć zużycie.' },
      {
        key: 'ai_data_processing_consent', label: 'Przetwarzanie danych przez dostawców modeli', type: 'checkboxes',
        options: [
          { value: 'accepted', label: 'Akceptujemy przekazywanie treści (dane firm, notatki i transkrypcje rozmów) do wybranego dostawcy modelu AI' },
          { value: 'eu_only', label: 'Wymagamy przetwarzania wyłącznie na terenie UE' },
        ],
      },
    ],
  },
  {
    id: 'seo',
    title: '9. SEObot',
    isVisible: hasModule('seo_bot'),
    fields: [
      { key: 'seo_website_url', label: 'Adres strony / bloga', type: 'text', placeholder: 'https://firma.pl/blog' },
      {
        key: 'seo_publishing_platform', label: 'Gdzie publikujemy artykuły?', type: 'select',
        options: [
          { value: 'wordpress', label: 'WordPress' },
          { value: 'other', label: 'Inny system' },
          { value: 'undecided', label: 'Do ustalenia' },
        ],
      },
      { key: 'seo_articles_per_day', label: 'Ile artykułów dziennie?', type: 'number' },
      {
        key: 'seo_channels', label: 'Dodatkowe kanały i źródła danych', type: 'checkboxes',
        options: [
          { value: 'gsc', label: 'Google Search Console (mamy dostęp właściciela do usługi)' },
          { value: 'linkedin', label: 'Publikacja na firmowym profilu LinkedIn' },
          { value: 'facebook', label: 'Publikacja na firmowej stronie Facebook' },
        ],
      },
    ],
  },
  {
    id: 'data',
    title: '10. Dane i słowniki',
    fields: [
      {
        key: 'import_scope', label: 'Jakie dane importujemy na start?', type: 'checkboxes',
        options: [
          { value: 'leads', label: 'Leady / szanse sprzedaży' },
          { value: 'partners', label: 'Obecni klienci / partnerzy' },
          { value: 'contacts', label: 'Osoby kontaktowe' },
          { value: 'documents', label: 'Dokumenty / umowy' },
        ],
      },
      { key: 'import_source', label: 'Skąd pochodzą dane i ile ich jest?', type: 'textarea', placeholder: 'np. Excel, ok. 2 000 leadów i 300 klientów', hint: 'Obecny system (Excel, inny CRM, ERP) i przybliżona liczba rekordów.' },
      { key: 'dwh_source', label: 'Dane sprzedażowe — z jakiego systemu i jak często mają być aktualizowane?', type: 'textarea', isVisible: hasModule('dwh_integration'), hint: 'System źródłowy (ERP / system sprzedażowy), format eksportu i częstotliwość.' },
      { key: 'sales_stages', label: 'Etapy lejka sprzedażowego', type: 'textarea', placeholder: 'Nowy → Kwalifikacja → Prezentacja → Oferta → Negocjacje → Wygrana / Przegrana', hint: 'Zostaw puste, jeśli odpowiada Państwu domyślny lejek.' },
      { key: 'lead_sources', label: 'Źródła leadów', type: 'textarea', placeholder: 'Strona www, polecenie, cold call, LinkedIn, targi…' },
      { key: 'currencies', label: 'Waluty, w których Państwo sprzedają', type: 'text', placeholder: 'PLN, EUR' },
    ],
  },
  {
    id: 'notes',
    title: '11. Uwagi',
    fields: [
      { key: 'additional_notes', label: 'Inne wymagania, pytania lub ograniczenia', type: 'textarea' },
    ],
  },
];

export function visibleSurveySections(answers: SurveyAnswers): SurveySection[] {
  return ONBOARDING_SURVEY_SECTIONS.filter(section => !section.isVisible || section.isVisible(answers));
}

export function visibleSurveyFields(section: SurveySection, answers: SurveyAnswers): SurveyField[] {
  return section.fields.filter(field => !field.isVisible || field.isVisible(answers));
}
