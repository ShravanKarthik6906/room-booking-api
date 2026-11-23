// Small validation helpers shared by the routes.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ISO 8601 date-time WITH a timezone, e.g. 2026-12-01T14:00:00Z or 2026-12-01T09:00:00-05:00
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

// Returns true only for real dates, e.g. rejects 2026-02-30
function isRealDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

// Returns a Date for a valid ISO timestamp string, or null if invalid
function parseIsoTimestamp(value) {
  if (typeof value !== 'string') return null;
  const m = ISO_RE.exec(value);
  if (!m) return null;

  const [, y, mo, d, h, mi] = m.map(Number);
  if (!isRealDate(y, mo, d) || h > 23 || mi > 59) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Validates a YYYY-MM-DD string, e.g. for ?date=
function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return Boolean(m) && isRealDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

module.exports = { isUuid, parseIsoTimestamp, isIsoDate };
