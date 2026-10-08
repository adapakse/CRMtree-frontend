// Translation keys (scope `crm`) for the fixed CRM values that used to carry
// hardcoded Polish labels. Most values map straight to a key
// (`labels.stages.<stage>`); lead sources need a table because their stored
// values are free-form strings, some of them Polish.

const LEAD_SOURCE_KEYS: Record<string, string> = {
  'Własne': 'own',
  'Cold_Call': 'coldCall',
  'Partner': 'partner',
  'Ajent': 'agent',
  'LinkedIn_Lead_Form': 'linkedinLeadForm',
  'LinkedIn_in_mail': 'linkedinInMail',
  'Alias_Hello': 'aliasHello',
  'Formularz_online': 'onlineForm',
  'GoogleAds_AISearch': 'googleAdsAiSearch',
  'GoogleAds_PMax': 'googleAdsPmax',
  'GoogleAds_SEA_Brand': 'googleAdsSeaBrand',
  // Values of older data.
  strona_www: 'website',
  polecenie: 'referral',
  cold_call: 'coldCall',
  linkedin: 'linkedin',
  targi: 'tradeFair',
  partner: 'partner',
  agent: 'agent',
  kampania: 'emailCampaign',
  inbound: 'inbound',
  inne: 'other',
};

/**
 * Key of a lead source's label, relative to the `crm` scope, or null for a
 * source the tenant defined itself — those are shown as stored.
 */
export function leadSourceLabelKey(source: string): string | null {
  const key = LEAD_SOURCE_KEYS[source];
  return key ? `labels.sources.${key}` : null;
}
