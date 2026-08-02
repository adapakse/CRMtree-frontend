// src/app/core/config/email-providers.config.ts
//
// Frontend-side display metadata for the CRM email providers. Kept in one
// place so the "connected via X" badge (crm-lead-detail / crm-partner-detail)
// and the tenant admin panel render provider names/colors consistently, and
// so a future provider only needs one new entry here — no branching logic
// elsewhere in the UI, since the active provider is resolved by the backend.

export type EmailProviderKey = 'gmail' | 'outlook' | 'zoho';

export interface EmailProviderMeta {
  key: EmailProviderKey;
  label: string;
  color: string;
  bg: string;
}

export const EMAIL_PROVIDERS: Record<EmailProviderKey, EmailProviderMeta> = {
  gmail:   { key: 'gmail',   label: 'Gmail',   color: '#3BAA5D', bg: '#f0fdf4' },
  outlook: { key: 'outlook', label: 'Outlook', color: '#0078d4', bg: '#eff6ff' },
  zoho:    { key: 'zoho',    label: 'Zoho',    color: '#E42527', bg: '#fef2f2' },
};
