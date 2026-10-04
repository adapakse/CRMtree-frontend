// Single definition of the tenant onboarding survey. Both the page the tenant
// admin fills in and the read-only view super admins open in Tenants render
// from it, so a question is added in exactly one place. The backend stores a
// flat key → value map and knows nothing about these fields, except that
// `secret` fields travel in a separate, encrypted map.
//
// Texts are Transloco keys relative to the `admin` scope, translated where they
// are rendered: the translations load lazily, after this constant is built.
// Field keys and option values are what gets stored, so they never change with
// the language.

export type SurveyAnswerValue = string | string[];
export type SurveyAnswers = Record<string, SurveyAnswerValue>;

export type SurveyFieldType =
  | 'text' | 'textarea' | 'email' | 'tel' | 'number' | 'date'
  | 'select' | 'checkboxes' | 'secret';

export interface SurveyOption {
  value: string;
  labelKey: string;
  hintKey?: string;
}

export interface SurveyField {
  key: string;
  labelKey: string;
  type: SurveyFieldType;
  hintKey?: string;
  placeholderKey?: string;
  options?: SurveyOption[];
  isRequired?: boolean;
  isVisible?: (answers: SurveyAnswers) => boolean;
}

export interface SurveySection {
  id: string;
  titleKey: string;
  introKey?: string;
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
  { value: 'yes', labelKey: 'onboardingSurvey.options.yesNo.yes' },
  { value: 'no', labelKey: 'onboardingSurvey.options.yesNo.no' },
];

const OAUTH_APP_OWNER: SurveyOption[] = [
  { value: 'client', labelKey: 'onboardingSurvey.options.oauthAppOwner.client' },
  { value: 'needs_help', labelKey: 'onboardingSurvey.options.oauthAppOwner.needs_help' },
];

const AI_LICENCE: SurveyOption[] = [
  { value: 'shared', labelKey: 'onboardingSurvey.options.aiLicence.shared' },
  { value: 'own', labelKey: 'onboardingSurvey.options.aiLicence.own' },
  { value: 'undecided', labelKey: 'onboardingSurvey.options.aiLicence.undecided' },
];

export const ONBOARDING_SURVEY_SECTIONS: SurveySection[] = [
  {
    id: 'company',
    titleKey: 'onboardingSurvey.sections.company.title',
    introKey: 'onboardingSurvey.sections.company.intro',
    fields: [
      { key: 'company_display_name', labelKey: 'onboardingSurvey.questions.company_display_name.label', type: 'text', isRequired: true, placeholderKey: 'onboardingSurvey.questions.company_display_name.placeholder' },
      { key: 'company_email_domain', labelKey: 'onboardingSurvey.questions.company_email_domain.label', type: 'text', placeholderKey: 'onboardingSurvey.questions.company_email_domain.placeholder', hintKey: 'onboardingSurvey.questions.company_email_domain.hint' },
      { key: 'company_industry', labelKey: 'onboardingSurvey.questions.company_industry.label', type: 'text', placeholderKey: 'onboardingSurvey.questions.company_industry.placeholder' },
      { key: 'company_offer_description', labelKey: 'onboardingSurvey.questions.company_offer_description.label', type: 'textarea', hintKey: 'onboardingSurvey.questions.company_offer_description.hint' },
      { key: 'business_contact_name', labelKey: 'onboardingSurvey.questions.business_contact_name.label', type: 'text', isRequired: true },
      { key: 'business_contact_email', labelKey: 'onboardingSurvey.questions.business_contact_email.label', type: 'email', isRequired: true },
      { key: 'business_contact_phone', labelKey: 'onboardingSurvey.questions.business_contact_phone.label', type: 'tel' },
      { key: 'technical_contact_name', labelKey: 'onboardingSurvey.questions.technical_contact_name.label', type: 'text', hintKey: 'onboardingSurvey.questions.technical_contact_name.hint' },
      { key: 'technical_contact_email', labelKey: 'onboardingSurvey.questions.technical_contact_email.label', type: 'email' },
      { key: 'technical_contact_phone', labelKey: 'onboardingSurvey.questions.technical_contact_phone.label', type: 'tel' },
      { key: 'go_live_date', labelKey: 'onboardingSurvey.questions.go_live_date.label', type: 'date' },
    ],
  },
  {
    id: 'billing',
    titleKey: 'onboardingSurvey.sections.billing.title',
    fields: [
      {
        key: 'billing_plan', labelKey: 'onboardingSurvey.questions.billing_plan.label', type: 'select', isRequired: true,
        options: [
          { value: 'lite', labelKey: 'onboardingSurvey.questions.billing_plan.options.lite.label' },
          { value: 'standard', labelKey: 'onboardingSurvey.questions.billing_plan.options.standard.label' },
          { value: 'professional', labelKey: 'onboardingSurvey.questions.billing_plan.options.professional.label' },
          { value: 'undecided', labelKey: 'onboardingSurvey.questions.billing_plan.options.undecided.label' },
        ],
      },
      {
        key: 'billing_cycle', labelKey: 'onboardingSurvey.questions.billing_cycle.label', type: 'select',
        options: [
          { value: 'monthly', labelKey: 'onboardingSurvey.questions.billing_cycle.options.monthly.label' },
          { value: 'annual', labelKey: 'onboardingSurvey.questions.billing_cycle.options.annual.label' },
        ],
      },
      { key: 'billing_company_name', labelKey: 'onboardingSurvey.questions.billing_company_name.label', type: 'text', isRequired: true, placeholderKey: 'onboardingSurvey.questions.billing_company_name.placeholder' },
      { key: 'billing_nip', labelKey: 'onboardingSurvey.questions.billing_nip.label', type: 'text', isRequired: true },
      { key: 'billing_street', labelKey: 'onboardingSurvey.questions.billing_street.label', type: 'text' },
      { key: 'billing_postal_code', labelKey: 'onboardingSurvey.questions.billing_postal_code.label', type: 'text' },
      { key: 'billing_city', labelKey: 'onboardingSurvey.questions.billing_city.label', type: 'text' },
      { key: 'billing_country', labelKey: 'onboardingSurvey.questions.billing_country.label', type: 'text', placeholderKey: 'onboardingSurvey.questions.billing_country.placeholder' },
      { key: 'billing_invoice_email', labelKey: 'onboardingSurvey.questions.billing_invoice_email.label', type: 'email', placeholderKey: 'onboardingSurvey.questions.billing_invoice_email.placeholder' },
    ],
  },
  {
    id: 'users',
    titleKey: 'onboardingSurvey.sections.users.title',
    fields: [
      { key: 'users_count', labelKey: 'onboardingSurvey.questions.users_count.label', type: 'number', isRequired: true },
      {
        key: 'users_list', labelKey: 'onboardingSurvey.questions.users_list.label', type: 'textarea',
        placeholderKey: 'onboardingSurvey.questions.users_list.placeholder',
        hintKey: 'onboardingSurvey.questions.users_list.hint',
      },
      { key: 'users_team_structure', labelKey: 'onboardingSurvey.questions.users_team_structure.label', type: 'textarea', hintKey: 'onboardingSurvey.questions.users_team_structure.hint' },
      {
        key: 'users_global_read', labelKey: 'onboardingSurvey.questions.users_global_read.label', type: 'select',
        options: [
          { value: 'own_only', labelKey: 'onboardingSurvey.questions.users_global_read.options.own_only.label' },
          { value: 'read_all', labelKey: 'onboardingSurvey.questions.users_global_read.options.read_all.label' },
          { value: 'undecided', labelKey: 'onboardingSurvey.questions.users_global_read.options.undecided.label' },
        ],
      },
    ],
  },
  {
    id: 'modules',
    titleKey: 'onboardingSurvey.sections.modules.title',
    introKey: 'onboardingSurvey.sections.modules.intro',
    fields: [
      {
        key: 'modules', labelKey: 'onboardingSurvey.questions.modules.label', type: 'checkboxes', isRequired: true,
        options: [
          { value: 'leads', labelKey: 'onboardingSurvey.questions.modules.options.leads.label', hintKey: 'onboardingSurvey.questions.modules.options.leads.hint' },
          { value: 'partner_registry', labelKey: 'onboardingSurvey.questions.modules.options.partner_registry.label', hintKey: 'onboardingSurvey.questions.modules.options.partner_registry.hint' },
          { value: 'sales_reports', labelKey: 'onboardingSurvey.questions.modules.options.sales_reports.label' },
          { value: 'performance', labelKey: 'onboardingSurvey.questions.modules.options.performance.label', hintKey: 'onboardingSurvey.questions.modules.options.performance.hint' },
          { value: 'onboarding', labelKey: 'onboardingSurvey.questions.modules.options.onboarding.label', hintKey: 'onboardingSurvey.questions.modules.options.onboarding.hint' },
          { value: 'documents', labelKey: 'onboardingSurvey.questions.modules.options.documents.label', hintKey: 'onboardingSurvey.questions.modules.options.documents.hint' },
          { value: 'prospects', labelKey: 'onboardingSurvey.questions.modules.options.prospects.label', hintKey: 'onboardingSurvey.questions.modules.options.prospects.hint' },
          { value: 'pbx', labelKey: 'onboardingSurvey.questions.modules.options.pbx.label', hintKey: 'onboardingSurvey.questions.modules.options.pbx.hint' },
          { value: 'call_analysis', labelKey: 'onboardingSurvey.questions.modules.options.call_analysis.label', hintKey: 'onboardingSurvey.questions.modules.options.call_analysis.hint' },
          { value: 'whatsapp', labelKey: 'onboardingSurvey.questions.modules.options.whatsapp.label', hintKey: 'onboardingSurvey.questions.modules.options.whatsapp.hint' },
          { value: 'seo_bot', labelKey: 'onboardingSurvey.questions.modules.options.seo_bot.label', hintKey: 'onboardingSurvey.questions.modules.options.seo_bot.hint' },
          { value: 'dwh_integration', labelKey: 'onboardingSurvey.questions.modules.options.dwh_integration.label', hintKey: 'onboardingSurvey.questions.modules.options.dwh_integration.hint' },
        ],
      },
    ],
  },
  {
    id: 'email',
    titleKey: 'onboardingSurvey.sections.email.title',
    introKey: 'onboardingSurvey.sections.email.intro',
    fields: [
      {
        key: 'email_provider', labelKey: 'onboardingSurvey.questions.email_provider.label', type: 'select', isRequired: true,
        options: [
          { value: 'gmail', labelKey: 'onboardingSurvey.questions.email_provider.options.gmail.label' },
          { value: 'outlook', labelKey: 'onboardingSurvey.questions.email_provider.options.outlook.label' },
          { value: 'zoho', labelKey: 'onboardingSurvey.questions.email_provider.options.zoho.label' },
          { value: 'other', labelKey: 'onboardingSurvey.questions.email_provider.options.other.label' },
          { value: 'none', labelKey: 'onboardingSurvey.questions.email_provider.options.none.label' },
        ],
      },
      { key: 'email_other_provider', labelKey: 'onboardingSurvey.questions.email_other_provider.label', type: 'text', isVisible: isAnswer('email_provider', 'other'), hintKey: 'onboardingSurvey.questions.email_other_provider.hint' },
      { key: 'email_mailbox_count', labelKey: 'onboardingSurvey.questions.email_mailbox_count.label', type: 'number', isVisible: isAnyOf('email_provider', ['gmail', 'outlook', 'zoho']) },
      { key: 'email_oauth_app_owner', labelKey: 'onboardingSurvey.questions.email_oauth_app_owner.label', type: 'select', options: OAUTH_APP_OWNER, isVisible: isAnyOf('email_provider', ['gmail', 'outlook', 'zoho']) },

      { key: 'gmail_client_id', labelKey: 'onboardingSurvey.questions.gmail_client_id.label', type: 'text', placeholderKey: 'onboardingSurvey.questions.gmail_client_id.placeholder', isVisible: isAnswer('email_provider', 'gmail') },
      { key: 'gmail_client_secret', labelKey: 'onboardingSurvey.questions.gmail_client_secret.label', type: 'secret', isVisible: isAnswer('email_provider', 'gmail') },
      { key: 'gmail_pubsub_topic', labelKey: 'onboardingSurvey.questions.gmail_pubsub_topic.label', type: 'text', placeholderKey: 'onboardingSurvey.questions.gmail_pubsub_topic.placeholder', hintKey: 'onboardingSurvey.questions.gmail_pubsub_topic.hint', isVisible: isAnswer('email_provider', 'gmail') },

      { key: 'outlook_client_id', labelKey: 'onboardingSurvey.questions.outlook_client_id.label', type: 'text', placeholderKey: 'onboardingSurvey.questions.outlook_client_id.placeholder', isVisible: isAnswer('email_provider', 'outlook') },
      { key: 'outlook_client_secret', labelKey: 'onboardingSurvey.questions.outlook_client_secret.label', type: 'secret', isVisible: isAnswer('email_provider', 'outlook') },
      { key: 'outlook_azure_tenant_id', labelKey: 'onboardingSurvey.questions.outlook_azure_tenant_id.label', type: 'text', hintKey: 'onboardingSurvey.questions.outlook_azure_tenant_id.hint', isVisible: isAnswer('email_provider', 'outlook') },
      { key: 'outlook_admin_consent', labelKey: 'onboardingSurvey.questions.outlook_admin_consent.label', type: 'select', options: YES_NO, isVisible: isAnswer('email_provider', 'outlook') },

      { key: 'zoho_client_id', labelKey: 'onboardingSurvey.questions.zoho_client_id.label', type: 'text', placeholderKey: 'onboardingSurvey.questions.zoho_client_id.placeholder', isVisible: isAnswer('email_provider', 'zoho') },
      { key: 'zoho_client_secret', labelKey: 'onboardingSurvey.questions.zoho_client_secret.label', type: 'secret', isVisible: isAnswer('email_provider', 'zoho') },
      {
        key: 'zoho_data_center', labelKey: 'onboardingSurvey.questions.zoho_data_center.label', type: 'select', isVisible: isAnswer('email_provider', 'zoho'),
        options: [
          { value: 'eu', labelKey: 'onboardingSurvey.questions.zoho_data_center.options.eu.label' },
          { value: 'com', labelKey: 'onboardingSurvey.questions.zoho_data_center.options.com.label' },
          { value: 'other', labelKey: 'onboardingSurvey.questions.zoho_data_center.options.other.label' },
        ],
      },
    ],
  },
  {
    id: 'whatsapp',
    titleKey: 'onboardingSurvey.sections.whatsapp.title',
    introKey: 'onboardingSurvey.sections.whatsapp.intro',
    isVisible: hasModule('whatsapp'),
    fields: [
      {
        key: 'whatsapp_number_status', labelKey: 'onboardingSurvey.questions.whatsapp_number_status.label', type: 'select', isRequired: true,
        options: [
          { value: 'ready', labelKey: 'onboardingSurvey.questions.whatsapp_number_status.options.ready.label' },
          { value: 'has_number', labelKey: 'onboardingSurvey.questions.whatsapp_number_status.options.has_number.label' },
          { value: 'needs_number', labelKey: 'onboardingSurvey.questions.whatsapp_number_status.options.needs_number.label' },
        ],
      },
      { key: 'whatsapp_phone_number', labelKey: 'onboardingSurvey.questions.whatsapp_phone_number.label', type: 'tel', placeholderKey: 'onboardingSurvey.questions.whatsapp_phone_number.placeholder', isVisible: isAnyOf('whatsapp_number_status', ['ready', 'has_number']) },
      { key: 'whatsapp_display_name', labelKey: 'onboardingSurvey.questions.whatsapp_display_name.label', type: 'text' },
      { key: 'whatsapp_meta_verified', labelKey: 'onboardingSurvey.questions.whatsapp_meta_verified.label', type: 'select', options: [...YES_NO, { value: 'unknown', labelKey: 'onboardingSurvey.questions.whatsapp_meta_verified.options.unknown.label' }] },
      { key: 'whatsapp_waba_id', labelKey: 'onboardingSurvey.questions.whatsapp_waba_id.label', type: 'text', hintKey: 'onboardingSurvey.questions.whatsapp_waba_id.hint', isVisible: isAnswer('whatsapp_number_status', 'ready') },
      { key: 'whatsapp_phone_number_id', labelKey: 'onboardingSurvey.questions.whatsapp_phone_number_id.label', type: 'text', hintKey: 'onboardingSurvey.questions.whatsapp_phone_number_id.hint', isVisible: isAnswer('whatsapp_number_status', 'ready') },
      { key: 'whatsapp_access_token', labelKey: 'onboardingSurvey.questions.whatsapp_access_token.label', type: 'secret', hintKey: 'onboardingSurvey.questions.whatsapp_access_token.hint', isVisible: isAnswer('whatsapp_number_status', 'ready') },
      { key: 'whatsapp_app_secret', labelKey: 'onboardingSurvey.questions.whatsapp_app_secret.label', type: 'secret', hintKey: 'onboardingSurvey.questions.whatsapp_app_secret.hint', isVisible: isAnswer('whatsapp_number_status', 'ready') },
    ],
  },
  {
    id: 'pbx',
    titleKey: 'onboardingSurvey.sections.pbx.title',
    introKey: 'onboardingSurvey.sections.pbx.intro',
    isVisible: hasModule('pbx'),
    fields: [
      {
        key: 'pbx_account_status', labelKey: 'onboardingSurvey.questions.pbx_account_status.label', type: 'select', isRequired: true,
        options: [
          { value: 'has_account', labelKey: 'onboardingSurvey.questions.pbx_account_status.options.has_account.label' },
          { value: 'other_provider', labelKey: 'onboardingSurvey.questions.pbx_account_status.options.other_provider.label' },
          { value: 'needs_account', labelKey: 'onboardingSurvey.questions.pbx_account_status.options.needs_account.label' },
        ],
      },
      { key: 'pbx_account_name', labelKey: 'onboardingSurvey.questions.pbx_account_name.label', type: 'text', isVisible: isAnswer('pbx_account_status', 'has_account') },
      { key: 'pbx_current_provider', labelKey: 'onboardingSurvey.questions.pbx_current_provider.label', type: 'text', isVisible: isAnswer('pbx_account_status', 'other_provider') },
      { key: 'pbx_extension_count', labelKey: 'onboardingSurvey.questions.pbx_extension_count.label', type: 'number' },
      { key: 'pbx_phone_numbers', labelKey: 'onboardingSurvey.questions.pbx_phone_numbers.label', type: 'textarea', hintKey: 'onboardingSurvey.questions.pbx_phone_numbers.hint' },
      { key: 'pbx_call_recording', labelKey: 'onboardingSurvey.questions.pbx_call_recording.label', type: 'select', options: YES_NO, hintKey: 'onboardingSurvey.questions.pbx_call_recording.hint' },
    ],
  },
  {
    id: 'ai',
    titleKey: 'onboardingSurvey.sections.ai.title',
    introKey: 'onboardingSurvey.sections.ai.intro',
    isVisible: hasAnyModule('prospects', 'call_analysis'),
    fields: [
      {
        key: 'enrichment_model', labelKey: 'onboardingSurvey.questions.enrichment_model.label', type: 'select', isVisible: hasModule('prospects'),
        options: [
          { value: 'deepseek', labelKey: 'onboardingSurvey.questions.enrichment_model.options.deepseek.label' },
          { value: 'anthropic', labelKey: 'onboardingSurvey.questions.enrichment_model.options.anthropic.label' },
          { value: 'undecided', labelKey: 'onboardingSurvey.questions.enrichment_model.options.undecided.label' },
        ],
      },
      { key: 'enrichment_licence', labelKey: 'onboardingSurvey.questions.enrichment_licence.label', type: 'select', options: AI_LICENCE, isRequired: true, isVisible: hasModule('prospects') },
      { key: 'enrichment_api_key', labelKey: 'onboardingSurvey.questions.enrichment_api_key.label', type: 'secret', isVisible: answers => hasModule('prospects')(answers) && isAnswer('enrichment_licence', 'own')(answers) },
      { key: 'enrichment_monthly_volume', labelKey: 'onboardingSurvey.questions.enrichment_monthly_volume.label', type: 'number', isVisible: hasModule('prospects') },
      {
        key: 'enrichment_ideal_customer', labelKey: 'onboardingSurvey.questions.enrichment_ideal_customer.label', type: 'textarea', isVisible: hasModule('prospects'),
        hintKey: 'onboardingSurvey.questions.enrichment_ideal_customer.hint',
      },

      { key: 'call_analysis_licence', labelKey: 'onboardingSurvey.questions.call_analysis_licence.label', type: 'select', options: AI_LICENCE, isRequired: true, isVisible: hasModule('call_analysis'), hintKey: 'onboardingSurvey.questions.call_analysis_licence.hint' },
      { key: 'call_analysis_api_key', labelKey: 'onboardingSurvey.questions.call_analysis_api_key.label', type: 'secret', isVisible: answers => hasModule('call_analysis')(answers) && isAnswer('call_analysis_licence', 'own')(answers) },
      { key: 'call_analysis_monthly_volume', labelKey: 'onboardingSurvey.questions.call_analysis_monthly_volume.label', type: 'number', isVisible: hasModule('call_analysis') },
      {
        key: 'call_analysis_buying_signals', labelKey: 'onboardingSurvey.questions.call_analysis_buying_signals.label', type: 'textarea', isVisible: hasModule('call_analysis'),
        hintKey: 'onboardingSurvey.questions.call_analysis_buying_signals.hint',
      },

      { key: 'ai_monthly_budget', labelKey: 'onboardingSurvey.questions.ai_monthly_budget.label', type: 'text', placeholderKey: 'onboardingSurvey.questions.ai_monthly_budget.placeholder', hintKey: 'onboardingSurvey.questions.ai_monthly_budget.hint' },
      {
        key: 'ai_data_processing_consent', labelKey: 'onboardingSurvey.questions.ai_data_processing_consent.label', type: 'checkboxes',
        options: [
          { value: 'accepted', labelKey: 'onboardingSurvey.questions.ai_data_processing_consent.options.accepted.label' },
          { value: 'eu_only', labelKey: 'onboardingSurvey.questions.ai_data_processing_consent.options.eu_only.label' },
        ],
      },
    ],
  },
  {
    id: 'seo',
    titleKey: 'onboardingSurvey.sections.seo.title',
    isVisible: hasModule('seo_bot'),
    fields: [
      { key: 'seo_website_url', labelKey: 'onboardingSurvey.questions.seo_website_url.label', type: 'text', placeholderKey: 'onboardingSurvey.questions.seo_website_url.placeholder' },
      {
        key: 'seo_publishing_platform', labelKey: 'onboardingSurvey.questions.seo_publishing_platform.label', type: 'select',
        options: [
          { value: 'wordpress', labelKey: 'onboardingSurvey.questions.seo_publishing_platform.options.wordpress.label' },
          { value: 'other', labelKey: 'onboardingSurvey.questions.seo_publishing_platform.options.other.label' },
          { value: 'undecided', labelKey: 'onboardingSurvey.questions.seo_publishing_platform.options.undecided.label' },
        ],
      },
      { key: 'seo_articles_per_day', labelKey: 'onboardingSurvey.questions.seo_articles_per_day.label', type: 'number' },
      {
        key: 'seo_channels', labelKey: 'onboardingSurvey.questions.seo_channels.label', type: 'checkboxes',
        options: [
          { value: 'gsc', labelKey: 'onboardingSurvey.questions.seo_channels.options.gsc.label' },
          { value: 'linkedin', labelKey: 'onboardingSurvey.questions.seo_channels.options.linkedin.label' },
          { value: 'facebook', labelKey: 'onboardingSurvey.questions.seo_channels.options.facebook.label' },
        ],
      },
    ],
  },
  {
    id: 'data',
    titleKey: 'onboardingSurvey.sections.data.title',
    fields: [
      {
        key: 'import_scope', labelKey: 'onboardingSurvey.questions.import_scope.label', type: 'checkboxes',
        options: [
          { value: 'leads', labelKey: 'onboardingSurvey.questions.import_scope.options.leads.label' },
          { value: 'partners', labelKey: 'onboardingSurvey.questions.import_scope.options.partners.label' },
          { value: 'contacts', labelKey: 'onboardingSurvey.questions.import_scope.options.contacts.label' },
          { value: 'documents', labelKey: 'onboardingSurvey.questions.import_scope.options.documents.label' },
        ],
      },
      { key: 'import_source', labelKey: 'onboardingSurvey.questions.import_source.label', type: 'textarea', placeholderKey: 'onboardingSurvey.questions.import_source.placeholder', hintKey: 'onboardingSurvey.questions.import_source.hint' },
      { key: 'dwh_source', labelKey: 'onboardingSurvey.questions.dwh_source.label', type: 'textarea', isVisible: hasModule('dwh_integration'), hintKey: 'onboardingSurvey.questions.dwh_source.hint' },
      { key: 'sales_stages', labelKey: 'onboardingSurvey.questions.sales_stages.label', type: 'textarea', placeholderKey: 'onboardingSurvey.questions.sales_stages.placeholder', hintKey: 'onboardingSurvey.questions.sales_stages.hint' },
      { key: 'lead_sources', labelKey: 'onboardingSurvey.questions.lead_sources.label', type: 'textarea', placeholderKey: 'onboardingSurvey.questions.lead_sources.placeholder' },
      { key: 'currencies', labelKey: 'onboardingSurvey.questions.currencies.label', type: 'text', placeholderKey: 'onboardingSurvey.questions.currencies.placeholder' },
    ],
  },
  {
    id: 'notes',
    titleKey: 'onboardingSurvey.sections.notes.title',
    fields: [
      { key: 'additional_notes', labelKey: 'onboardingSurvey.questions.additional_notes.label', type: 'textarea' },
    ],
  },
];

export function visibleSurveySections(answers: SurveyAnswers): SurveySection[] {
  return ONBOARDING_SURVEY_SECTIONS.filter(section => !section.isVisible || section.isVisible(answers));
}

export function visibleSurveyFields(section: SurveySection, answers: SurveyAnswers): SurveyField[] {
  return section.fields.filter(field => !field.isVisible || field.isVisible(answers));
}
