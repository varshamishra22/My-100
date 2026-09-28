/**
 * Date and Timezone Utilities for 100 Days Challenge
 * Timezone: IST (Asia/Kolkata, UTC+5:30)
 * Challenge Duration: 29 September 2026 to 6 January 2027 (100 Days)
 */

export const CHALLENGE_CONFIG = {
  START_DATE: '2026-09-29',
  END_DATE: '2027-01-06',
  TOTAL_DAYS: 100,
  TIMEZONE: 'Asia/Kolkata'
};

// Date simulation state for testing/demo purposes
let simulatedDateOverride = null;

export function setSimulatedDate(dateStr) {
  simulatedDateOverride = dateStr; // e.g. "2026-09-29" or null for actual time
  if (dateStr) {
    localStorage.setItem('challenge_simulated_date', dateStr);
  } else {
    localStorage.removeItem('challenge_simulated_date');
  }
}

export function getSimulatedDate() {
  if (simulatedDateOverride === null) {
    simulatedDateOverride = localStorage.getItem('challenge_simulated_date');
  }
  return simulatedDateOverride;
}

/**
 * Gets the current date string (YYYY-MM-DD) in Asia/Kolkata timezone.
 * Takes simulated date into account if set.
 */
export function getCurrentISTDateString() {
  const simulated = getSimulatedDate();
  if (simulated) {
    return simulated;
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CHALLENGE_CONFIG.TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date()); // Formats as YYYY-MM-DD
}

/**
 * Converts a Date object or timestamp to IST Date object representation
 */
export function getISTDateObject(date = new Date()) {
  const istString = date.toLocaleString('en-US', { timeZone: CHALLENGE_CONFIG.TIMEZONE });
  return new Date(istString);
}

/**
 * Given a challenge day number (1 to 100), returns the corresponding YYYY-MM-DD date string.
 */
export function getDateForDay(dayNumber) {
  if (dayNumber < 1 || dayNumber > CHALLENGE_CONFIG.TOTAL_DAYS) {
    return null;
  }
  // Parse start date UTC components to avoid timezone drift
  const [year, month, day] = CHALLENGE_CONFIG.START_DATE.split('-').map(Number);
  const baseDate = new Date(Date.UTC(year, month - 1, day));
  baseDate.setUTCDate(baseDate.getUTCDate() + (dayNumber - 1));

  const y = baseDate.getUTCFullYear();
  const m = String(baseDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(baseDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Given a date string (YYYY-MM-DD), calculates the challenge day number (1 to 100).
 * Returns:
 * {
 *   dayNumber: number | null,
 *   status: 'before' | 'active' | 'completed',
 *   daysRemaining: number,
 *   daysUntilStart: number
 * }
 */
export function getChallengeDayInfo(targetDateStr = getCurrentISTDateString()) {
  const [sY, sM, sD] = CHALLENGE_CONFIG.START_DATE.split('-').map(Number);
  const [tY, tM, tD] = targetDateStr.split('-').map(Number);

  const startUtc = Date.UTC(sY, sM - 1, sD);
  const targetUtc = Date.UTC(tY, tM - 1, tD);

  const msPerDay = 1000 * 60 * 60 * 24;
  const diffDays = Math.round((targetUtc - startUtc) / msPerDay);

  if (diffDays < 0) {
    return {
      dayNumber: null,
      status: 'before',
      daysUntilStart: Math.abs(diffDays),
      daysRemaining: CHALLENGE_CONFIG.TOTAL_DAYS,
      currentDate: targetDateStr
    };
  }

  const calculatedDay = diffDays + 1;

  if (calculatedDay > CHALLENGE_CONFIG.TOTAL_DAYS) {
    return {
      dayNumber: CHALLENGE_CONFIG.TOTAL_DAYS,
      status: 'completed',
      daysUntilStart: 0,
      daysRemaining: 0,
      currentDate: targetDateStr
    };
  }

  return {
    dayNumber: calculatedDay,
    status: 'active',
    daysUntilStart: 0,
    daysRemaining: CHALLENGE_CONFIG.TOTAL_DAYS - calculatedDay,
    currentDate: targetDateStr
  };
}

/**
 * Formats a YYYY-MM-DD string into a human-readable date.
 * Example: "2026-09-29" -> "Tuesday, 29 September 2026" or "29 Sep 2026"
 */
export function formatReadableDate(dateStr, format = 'full') {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (format === 'short') {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short'
    }).format(date);
  }

  if (format === 'medium') {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(date);
  }

  // Full format
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

/**
 * Precomputes metadata for all 100 days
 */
export function getAll100DaysMetadata() {
  const list = [];
  for (let i = 1; i <= CHALLENGE_CONFIG.TOTAL_DAYS; i++) {
    const date = getDateForDay(i);
    list.push({
      dayNumber: i,
      date,
      readableDate: formatReadableDate(date, 'medium'),
      shortDate: formatReadableDate(date, 'short')
    });
  }
  return list;
}
