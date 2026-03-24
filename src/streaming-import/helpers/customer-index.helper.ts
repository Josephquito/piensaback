import { PrismaService } from '../../../prisma/prisma.service';
import { normalizePhone } from '../utils/money.util';

export interface CustomerIndex {
  byName: Map<string, number>;
  byContact: Map<string, number>;
}

export async function buildCustomerIndex(
  prisma: PrismaService,
  companyId: number,
): Promise<CustomerIndex> {
  const allCustomers = await prisma.customer.findMany({
    where: { companyId },
    select: { id: true, name: true, contact: true },
  });

  const byName = new Map<string, number>();
  for (const c of allCustomers) {
    byName.set(c.name.toLowerCase().trim(), c.id);
  }

  const byContact = new Map<string, number>();
  for (const c of allCustomers) {
    if (!c.contact) continue;
    const normalized = normalizePhone(c.contact);
    byContact.set(normalized, c.id);
    byContact.set('0' + normalized.slice(3), c.id);
    byContact.set('+' + normalized, c.id);
    byContact.set('+593' + normalized.slice(3), c.id);
    byContact.set(c.contact.trim().toLowerCase(), c.id);
  }

  return { byName, byContact };
}

export function resolveCustomerId(
  customerName: string,
  index: CustomerIndex,
): number | undefined {
  const { byName, byContact } = index;
  const normalized = normalizePhone(customerName);
  const nameVariants = [customerName.toLowerCase().trim()];

  // Soporte para "Cliente 001", "Cliente 1", etc.
  const clienteMatch = customerName.match(/^Cliente\s+(\d+)$/i);
  if (clienteMatch) {
    const num = parseInt(clienteMatch[1], 10);
    nameVariants.push(`cliente ${num}`);
    nameVariants.push(`cliente ${String(num).padStart(3, '0')}`);
    nameVariants.push(`cliente ${String(num).padStart(4, '0')}`);
  }

  for (const variant of nameVariants) {
    if (byName.has(variant)) return byName.get(variant);
  }

  return (
    byContact.get(normalized) ??
    byContact.get('0' + normalized.slice(3)) ??
    byContact.get('+' + normalized) ??
    byContact.get('+593' + normalized.slice(3)) ??
    byContact.get(customerName.trim().toLowerCase())
  );
}
