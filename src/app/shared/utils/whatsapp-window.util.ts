import { WhatsappHistoryEntry } from '../../core/services/crm-api.service';
import { normalizePhoneDigits } from './phone-format.util';

const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

// Meta allows free-form WhatsApp text only within 24h of the customer's last
// message; outside that window only an approved template gets delivered.
// This is a UI hint based on the history visible on this card — the backend
// re-checks tenant-wide before sending, so a message the customer sent while
// assigned to another lead still counts there.
export function isWhatsappWindowOpen(messages: WhatsappHistoryEntry[], phone: string, now = Date.now()): boolean {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return false;
  return messages.some(m =>
    m.direction === 'incoming'
    && normalizePhoneDigits(m.from_phone) === digits
    && now - new Date(m.created_at).getTime() < CUSTOMER_SERVICE_WINDOW_MS);
}
