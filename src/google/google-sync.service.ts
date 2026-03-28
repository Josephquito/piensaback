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

    const customerGroupMembers = await this.getGroupMembers(
      accessToken,
      company.googleGroupCustomers,
    );
    const supplierGroupMembers = await this.getGroupMembers(
      accessToken,
      company.googleGroupSuppliers,
    );

    console.log(`Total Google contacts: ${googleContacts.length}`);
    console.log(`Known IDs en BD: ${knownIds.size}`);
    console.log(`Grupo Clientes members: ${customerGroupMembers.size}`);
    console.log(`Grupo Proveedores members: ${supplierGroupMembers.size}`);

    const toImportAsCustomers: {
      companyId: number;
      name: string;
      contact: string;
      notes: string | null;
      googleContactId: string;
    }[] = [];

    const toImportAsSuppliers: {
      companyId: number;
      name: string;
      contact: string;
      notes: string | null;
      googleContactId: string;
    }[] = [];

    for (const gc of googleContacts) {
      if (knownIds.has(gc.resourceName)) continue;
      if (!gc.name && !gc.phone) continue;

      const nameLower = (gc.name || '').toLowerCase();
      const record = {
        companyId,
        name: gc.name || gc.phone,
        contact: gc.phone || '',
        notes: gc.notes ?? null,
        googleContactId: gc.resourceName,
      };

      if (
        customerGroupMembers.has(gc.resourceName) ||
        nameLower.startsWith('cliente')
      ) {
        toImportAsCustomers.push(record);
      } else if (
        supplierGroupMembers.has(gc.resourceName) ||
        nameLower.startsWith('prov')
      ) {
        toImportAsSuppliers.push(record);
      }
    }

    console.log(`A importar como clientes: ${toImportAsCustomers.length}`);
    console.log(`A importar como proveedores: ${toImportAsSuppliers.length}`);

    if (toImportAsCustomers.length > 0) {
      const result = await this.prisma.customer.createMany({
        data: toImportAsCustomers,
        skipDuplicates: true,
      });
      imported += result.count;
    }

    if (toImportAsSuppliers.length > 0) {
      const result = await this.prisma.supplier.createMany({
        data: toImportAsSuppliers,
        skipDuplicates: true,
      });
      imported += result.count;
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
        maxMembers: 10000, // ← subimos el límite
      });

      console.log(
        `Grupo ${groupResourceName}: ${res.data.memberResourceNames?.length ?? 0} miembros`,
      );
      return new Set(res.data.memberResourceNames ?? []);
    } catch (e: any) {
      console.error(`Error obteniendo miembros del grupo:`, e?.message);
      return new Set();
    }
  }
}
