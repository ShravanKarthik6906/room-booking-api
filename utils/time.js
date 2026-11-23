// Rutgers is in New Jersey, so "a day" means a day in Eastern time.
const CAMPUS_TIMEZONE = 'America/New_York';

// The calendar date (YYYY-MM-DD) of an instant, as seen on campus
function campusDate(date) {
  // 'en-CA' formats dates as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: CAMPUS_TIMEZONE }).format(date);
}

// The exact instant when a campus calendar day starts (midnight Eastern).
// Eastern is UTC-5 in winter and UTC-4 in summer, so try both and keep the
// one that really is midnight on that date in New York.
function startOfCampusDay(dateStr) {
  for (const offset of ['-05:00', '-04:00']) {
    const candidate = new Date(`${dateStr}T00:00:00${offset}`);
    const hour = new Intl.DateTimeFormat('en-US', {
      timeZone: CAMPUS_TIMEZONE, hour: 'numeric', hourCycle: 'h23',
    }).format(candidate);
    if (campusDate(candidate) === dateStr && Number(hour) === 0) return candidate;
  }
  throw new Error(`Could not compute start of day for ${dateStr}`);
}

// Next calendar day as YYYY-MM-DD
function nextDate(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

module.exports = { CAMPUS_TIMEZONE, startOfCampusDay, nextDate };
