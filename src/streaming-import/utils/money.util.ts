import { Prisma } from '@prisma/client';

export function parseDecimalValue(value: string): Prisma.Decimal {
  const normalized = value
    .trim()
    .replace(/\$/g, '')
    .replace(/\s/g, '')
    .replace(',', '.');
  return new Prisma.Decimal(normalized || '0');
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('593')) return digits;
  if (digits.startsWith('0')) return '593' + digits.slice(1);
  return digits;
}
