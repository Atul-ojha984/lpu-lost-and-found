/**
 * Normalize supported Indian mobile input formats for form submission.
 * Backend validation with libphonenumber remains authoritative for number
 * allocation and mobile-vs-landline classification.
 */
export function normalizeIndianMobileInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^\+?[0-9\s-]+$/.test(trimmed)) return null;

  const compact = trimmed.replace(/[\s-]/g, '');
  let nationalNumber: string;

  if (compact.startsWith('+')) {
    if (!compact.startsWith('+91')) return null;
    nationalNumber = compact.slice(3);
  } else if (compact.length === 12 && compact.startsWith('91')) {
    nationalNumber = compact.slice(2);
  } else {
    nationalNumber = compact;
  }

  if (!/^[6-9][0-9]{9}$/.test(nationalNumber)) return null;
  return `+91${nationalNumber}`;
}
