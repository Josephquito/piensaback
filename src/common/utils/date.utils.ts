/**
 * Parsea X-User-Date header y retorna Date en UTC a medianoche.
 * Si no viene el header, usa fecha UTC actual del servidor como fallback.
 */
export function getTodayUTC(userDateHeader?: string): Date {
  if (userDateHeader && /^\d{4}-\d{2}-\d{2}$/.test(userDateHeader)) {
    const [year, month, day] = userDateHeader.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Días restantes desde todayUTC hasta cutoffDate.
 * Retorna 0 si ya venció o vence hoy.
 */
export function daysRemainingFrom(cutoffDate: Date, todayUTC: Date): number {
  const cutoff = new Date(
    Date.UTC(
      cutoffDate.getUTCFullYear(),
      cutoffDate.getUTCMonth(),
      cutoffDate.getUTCDate(),
    ),
  );
  return Math.max(
    0,
    Math.ceil((cutoff.getTime() - todayUTC.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

/**
 * True solo si cutoffDate < todayUTC (ya pasó, no vence hoy).
 */
export function isExpiredFrom(cutoffDate: Date, todayUTC: Date): boolean {
  const cutoff = new Date(
    Date.UTC(
      cutoffDate.getUTCFullYear(),
      cutoffDate.getUTCMonth(),
      cutoffDate.getUTCDate(),
    ),
  );
  return todayUTC > cutoff;
}
