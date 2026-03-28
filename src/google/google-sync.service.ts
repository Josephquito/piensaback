import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleAuthService } from './google-auth.service';
import { GoogleContactsService } from './google-contacts.service';

@Injectable()
export class GoogleSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleAuth: GoogleAuthService,
    private readonly googleContacts: GoogleContactsService,
  ) {}

  async syncAll(companyId: number): Promise<{
    imported: number;
    exported: number;
    updated: number;
  }> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        googleConnected: true,
        googleGroupCustomers: true,
        googleGroupSuppliers: true,
      },
    });

    if (!company?.googleConnected) {
      throw new Error('Google no está conectado para esta empresa.');
    }

    const accessToken = await this.googleAuth.getAccessToken(companyId);
    const googleContacts = await this.googleContacts.listContacts(accessToken);

    let imported = 0;
    let exported = 0;
    let updated = 0;

    // ── 1. Exportar customers sin googleContactId ──────────────────
    const customersToExport = await this.prisma.customer.findMany({
      where: { companyId, googleContactId: null },
      select: { id: true, name: true, contact: true, notes: true },
    });

    for (const c of customersToExport) {
      try {
        const resourceName = await this.googleContacts.createContact(
          accessToken,
          { name: c.name, phone: c.contact, notes: c.notes ?? undefined },
        );

        if (company.googleGroupCustomers) {
          await this.googleContacts.addContactToGroup(
            accessToken,
            company.googleGroupCustomers,
            resourceName,
          );
        }

        await this.prisma.customer.update({
          where: { id: c.id },
          data: { googleContactId: resourceName },
        });

        exported++;
      } catch {
        // Continuar con el siguiente si uno falla
      }
    }

    // ── 2. Exportar suppliers sin googleContactId ──────────────────
    const suppliersToExport = await this.prisma.supplier.findMany({
      where: { companyId, googleContactId: null },
      select: { id: true, name: true, contact: true, notes: true },
    });

    for (const s of suppliersToExport) {
      try {
        const resourceName = await this.googleContacts.createContact(
          accessToken,
          { name: s.name, phone: s.contact, notes: s.notes ?? undefined },
        );

        if (company.googleGroupSuppliers) {
          await this.googleContacts.addContactToGroup(
            accessToken,
            company.googleGroupSuppliers,
            resourceName,
          );
        }

        await this.prisma.supplier.update({
          where: { id: s.id },
          data: { googleContactId: resourceName },
        });

        exported++;
      } catch {
        // Continuar con el siguiente si uno falla
      }
    }

    // ── 3. Importar contactos de Google que no existen en BD ───────
    const existingCustomerIds = await this.prisma.customer.findMany({
      where: { companyId, googleContactId: { not: null } },
      select: { googleContactId: true },
    });
    const existingSupplierIds = await this.prisma.supplier.findMany({
      where: { companyId, googleContactId: { not: null } },
      select: { googleContactId: true },
    });

    const knownIds = new Set([
      ...existingCustomerIds.map((c) => c.googleContactId),
      ...existingSupplierIds.map((s) => s.googleContactId),
    ]);

    // Contactos en Google que pertenecen al grupo Clientes
    const customerGroupMembers = await this.getGroupMembers(
      accessToken,
      company.googleGroupCustomers,
    );
    // Contactos en Google que pertenecen al grupo Proveedores
    const supplierGroupMembers = await this.getGroupMembers(
      accessToken,
      company.googleGroupSuppliers,
    );

    for (const gc of googleContacts) {
      if (knownIds.has(gc.resourceName)) continue;
      if (!gc.name && !gc.phone) continue;

      try {
        if (customerGroupMembers.has(gc.resourceName)) {
          // Importar como cliente
          await this.prisma.customer.create({
            data: {
              companyId,
              name: gc.name || gc.phone,
              contact: gc.phone || '',
              notes: gc.notes ?? null,
              googleContactId: gc.resourceName,
            },
          });
          imported++;
        } else if (supplierGroupMembers.has(gc.resourceName)) {
          // Importar como proveedor
          await this.prisma.supplier.create({
            data: {
              companyId,
              name: gc.name || gc.phone,
              contact: gc.phone || '',
              notes: gc.notes ?? null,
              googleContactId: gc.resourceName,
            },
          });
          imported++;
        }
        // Si no pertenece a ningún grupo conocido, se ignora
      } catch {
        // Continuar con el siguiente si uno falla
      }
    }

    // ── 4. Actualizar contactos que cambiaron en Google ────────────
    const googleMap = new Map(googleContacts.map((c) => [c.resourceName, c]));

    const allCustomers = await this.prisma.customer.findMany({
      where: { companyId, googleContactId: { not: null } },
      select: { id: true, name: true, contact: true, googleContactId: true },
    });

    for (const c of allCustomers) {
      const gc = googleMap.get(c.googleContactId!);
      if (!gc) continue;
      if (gc.name !== c.name || gc.phone !== c.contact) {
        try {
          await this.prisma.customer.update({
            where: { id: c.id },
            data: { name: gc.name, contact: gc.phone },
          });
          updated++;
        } catch {
          // Continuar
        }
      }
    }

    const allSuppliers = await this.prisma.supplier.findMany({
      where: { companyId, googleContactId: { not: null } },
      select: { id: true, name: true, contact: true, googleContactId: true },
    });

    for (const s of allSuppliers) {
      const gc = googleMap.get(s.googleContactId!);
      if (!gc) continue;
      if (gc.name !== s.name || gc.phone !== s.contact) {
        try {
          await this.prisma.supplier.update({
            where: { id: s.id },
            data: { name: gc.name, contact: gc.phone },
          });
          updated++;
        } catch {
          // Continuar
        }
      }
    }

    return { imported, exported, updated };
  }

  // Helper para obtener miembros de un grupo como Set
  private async getGroupMembers(
    accessToken: string,
    groupResourceName: string | null,
  ): Promise<Set<string>> {
    if (!groupResourceName) return new Set();
    try {
      const { google } = await import('googleapis');
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const people = google.people({ version: 'v1', auth });

      const res = await people.contactGroups.get({
        resourceName: groupResourceName,
        maxMembers: 1000,
      });

      return new Set(res.data.memberResourceNames ?? []);
    } catch {
      return new Set();
    }
  }
}
