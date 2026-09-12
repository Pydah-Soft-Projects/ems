export function parseISTDate(value: string | Date): Date {
  if (value instanceof Date) return value;

  const raw = String(value ?? '').trim();
  if (!raw) return new Date(NaN);

  // If it's a pure date format YYYY-MM-DD
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, y, m, d] = dateOnlyMatch;
    // Construct local Date at noon to prevent any DST/timezone day shifts
    return new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
  }

  const isoValue = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoValue);
  return new Date(hasTimezone ? isoValue : `${isoValue}+05:30`);
}

export function formatIST(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = parseISTDate(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
  });
}

export function formatPaymentIST(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = parseISTDate(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
  });
}

export function formatPaymentISTDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = parseISTDate(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatISTDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = parseISTDate(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatISTDateRange(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
): string {
  const s = formatPaymentISTDate(start);
  const e = formatPaymentISTDate(end);
  if (s === '—' && e === '—') return '—';
  if (s === '—') return e;
  if (e === '—') return s;
  if (s === e) return s;
  return `${s} to ${e}`;
}

/**
 * Format pure date (YYYY-MM-DD or ISO) as 'DD/MM/YYYY' in IST
 */
export function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  return formatISTDate(value);
}
