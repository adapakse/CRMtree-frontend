// Picker hint only; the backend MIME allowlist stays authoritative.
export const ATTACHMENT_ACCEPTED_EXTENSIONS = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.zip';

// Mirrors the backend default MAX_FILE_SIZE_MB, so an oversized file fails before upload.
export const ATTACHMENT_MAX_SIZE_MB = 50;

export function formatAttachmentSize(bytes: number, locale: string): string {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toLocaleString(locale, { maximumFractionDigits: 1 }) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)).toLocaleString(locale) + ' KB';
}
