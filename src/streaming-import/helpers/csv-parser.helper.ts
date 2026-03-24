import { Prisma } from '@prisma/client';
import { parseDate } from '../utils/date.util';
import { parseDecimalValue } from '../utils/money.util';

export const CSV_HEADERS = [
  'platform',
  'email',
  'password',
  'purchase_date',
  'duration_days',
  'total_cost',
  'supplier_name',
  'supplier_contact',
  'profile_no',
  'sale_price',
  'sale_date',
  'sale_duration_days',
  'customer_name',
  'label_name',
  'label_color',
] as const;

export interface ImportRow {
  platform: string;
  email: string;
  password: string;
  purchase_date: string;
  duration_days: string;
  total_cost: string;
  supplier_name: string;
  supplier_contact: string;
  profile_no: string;
  sale_price: string;
  sale_date: string;
  sale_duration_days: string;
  customer_name: string;
  label_name: string;
  label_color: string;
}

export interface ProfileData {
  profileNo: number;
  salePrice?: Prisma.Decimal;
  saleDate?: Date;
  saleDurationDays?: number;
  customerName?: string;
  labelName?: string;
  labelColor?: string;
}

export interface AccountGroup {
  platform: string;
  email: string;
  password: string;
  purchaseDate: Date;
  durationDays: number;
  totalCost: Prisma.Decimal;
  supplierName: string;
  supplierContact: string;
  profiles: ProfileData[];
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function parseBuffer(buffer: Buffer): Map<string, ImportRow[]> {
  const text = buffer
    .toString('utf-8')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const lines = text.split('\n').filter((l) => l.trim() !== '');

  if (lines.length < 2) {
    throw new Error('El CSV debe tener cabecera y al menos una fila.');
  }

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const missingHeaders = CSV_HEADERS.filter((h) => !headers.includes(h));
  if (missingHeaders.length > 0) {
    throw new Error(
      `Faltan columnas: ${missingHeaders.join(', ')}. Usa la plantilla del sistema.`,
    );
  }

  const rows: ImportRow[] = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i]?.trim() ?? '';
    });
    return row as unknown as ImportRow;
  });

  const byPlatform = new Map<string, ImportRow[]>();
  for (const row of rows) {
    const p = row.platform?.trim();
    if (!p) continue;
    if (!byPlatform.has(p)) byPlatform.set(p, []);
    byPlatform.get(p)!.push(row);
  }

  return byPlatform;
}

export function groupByAccount(rows: ImportRow[]): AccountGroup[] {
  const map = new Map<string, AccountGroup>();

  for (const row of rows) {
    const email = row.email?.trim();
    if (!email) continue;

    if (!map.has(email)) {
      map.set(email, {
        platform: row.platform?.trim() ?? '',
        email,
        password: row.password?.trim() ?? '',
        purchaseDate: parseDate(row.purchase_date),
        durationDays: Number(row.duration_days),
        totalCost: parseDecimalValue(row.total_cost),
        supplierName: row.supplier_name?.trim() ?? '',
        supplierContact: row.supplier_contact?.trim() ?? '',
        profiles: [],
      });
    }

    const group = map.get(email)!;

    if (!group.supplierContact && row.supplier_contact?.trim()) {
      group.supplierContact = row.supplier_contact.trim();
    }

    const profileNo = Number(row.profile_no);
    if (!profileNo) continue;

    const hasSale =
      !!row.sale_price?.trim() &&
      !!row.sale_date?.trim() &&
      !!row.customer_name?.trim() &&
      !!row.sale_duration_days?.trim();

    group.profiles.push({
      profileNo,
      salePrice: hasSale ? parseDecimalValue(row.sale_price) : undefined,
      saleDate: hasSale ? parseDate(row.sale_date) : undefined,
      saleDurationDays: hasSale ? Number(row.sale_duration_days) : undefined,
      customerName: hasSale ? row.customer_name.trim() : undefined,
      labelName: row.label_name?.trim() || undefined,
      labelColor: row.label_color?.trim() || undefined,
    });
  }

  return Array.from(map.values());
}
