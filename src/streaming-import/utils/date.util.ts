export function parseDate(value: string): Date {
  if (!value?.trim()) return new Date('invalid');
  const v = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return new Date(`${v}T00:00:00Z`);
  }

  const slashDMY = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashDMY) {
    const [, d, m, y] = slashDMY;
    const year = y.length === 2 ? `20${y}` : y;
    return new Date(
      `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00Z`,
    );
  }

  const dashDMY = v.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dashDMY) {
    const [, d, m, y] = dashDMY;
    const year = y.length === 2 ? `20${y}` : y;
    return new Date(
      `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00Z`,
    );
  }

  const dmOnly = v.match(/^(\d{1,2})[-\/](\d{1,2})$/);
  if (dmOnly) {
    const [, d, m] = dmOnly;
    const year = new Date().getUTCFullYear();
    return new Date(
      `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00Z`,
    );
  }

  const fallback = new Date(v);
  return isNaN(fallback.getTime()) ? new Date('invalid') : fallback;
}

export function addDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );
}
