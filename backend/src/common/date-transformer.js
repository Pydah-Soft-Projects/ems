'use strict';

/**
 * Robust date transformer for TypeORM DATE columns.
 * Converts DATE columns between MySQL and JavaScript string ('YYYY-MM-DD').
 * Ensures dates are never shifted by UTC/IST timezone offsets.
 */
const dateTransformer = {
  to: (value) => {
    if (!value) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
      const d = new Date(trimmed);
      if (!Number.isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(d);
      }
      return trimmed;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(value);
    }
    return value;
  },
  from: (value) => {
    if (!value) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
      return trimmed.slice(0, 10);
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(value);
    }
    return value;
  },
};

module.exports = { dateTransformer };
