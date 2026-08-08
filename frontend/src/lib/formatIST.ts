export function parseISTDate(value: string | Date) {
  if (value instanceof Date) return value;

  const raw = String(value).trim();
  const isoValue = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoValue);
  return new Date(hasTimezone ? isoValue : `${isoValue}+05:30`);
}

export function formatIST(value: string | Date) {
  return parseISTDate(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
  });
}

export function formatPaymentIST(value: string | Date) {
  return parseISTDate(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
  });
}

export function formatPaymentISTDate(value: string | Date) {
  return parseISTDate(value).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
  });
}

export function formatISTDate(value: string | Date) {
  return parseISTDate(value).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
  });
}
