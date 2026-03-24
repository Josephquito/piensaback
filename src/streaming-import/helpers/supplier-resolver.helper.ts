import { Prisma } from '@prisma/client';

// Regla 4: crea el proveedor con lo que venga,
// aunque falte nombre o contacto, sin lanzar error.
export async function resolveSupplier(
  tx: Prisma.TransactionClient,
  companyId: number,
  supplierName: string,
  supplierContact: string,
): Promise<{ id: number }> {
  const name = supplierName?.trim() || '';
  const contact = supplierContact?.trim() || '';

  // Si no hay ni nombre ni contacto no podemos identificar al proveedor
  if (!name && !contact) {
    throw new Error('El proveedor no tiene nombre ni contacto en el CSV.');
  }

  if (name) {
    // Buscar por nombre; si existe actualizar contacto solo si el existente está vacío
    const existing = await tx.supplier.findFirst({
      where: { companyId, name },
      select: { id: true, contact: true },
    });

    if (existing) {
      if (!existing.contact && contact) {
        await tx.supplier.update({
          where: { id: existing.id },
          data: { contact },
        });
      }
      return { id: existing.id };
    }

    // Crear con lo que haya (contact puede quedar vacío)
    return tx.supplier.create({
      data: { companyId, name, contact },
      select: { id: true },
    });
  }

  // Solo hay contacto → buscar por contacto
  const byContact = await tx.supplier.findFirst({
    where: { companyId, contact },
    select: { id: true, name: true },
  });

  if (byContact) return { id: byContact.id };

  // Crear con nombre vacío para rellenar manualmente después
  return tx.supplier.create({
    data: { companyId, name: '', contact },
    select: { id: true },
  });
}
