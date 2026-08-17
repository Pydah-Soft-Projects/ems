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
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match;
      const dt = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
      return dt.toLocaleDateString('en-IN');
    }
  }
  const d = parseISTDate(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
  });
}

export function formatISTDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match;
      const dt = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
      return dt.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
  }
  const d = parseISTDate(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format pure date (YYYY-MM-DD or ISO) as 'DD/MM/YYYY' or 'DD MMM YYYY' in IST
 */
export function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  return formatISTDate(value);
}
