import { Injectable } from '@nestjs/common';
import { google, people_v1 } from 'googleapis';

export interface ContactData {
  name: string;
  phone: string;
  notes?: string;
}

export interface GoogleContact {
  resourceName: string;
  name: string;
  phone: string;
  notes?: string;
  etag?: string;
}

@Injectable()
export class GoogleContactsService {
  private getPeopleClient(accessToken: string): people_v1.People {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.people({ version: 'v1', auth });
  }

  // ─── Contact Groups ────────────────────────────────────────────────

  // Crear grupo (ej: "Clientes", "Proveedores")
  async findOrCreateGroup(accessToken: string, name: string): Promise<string> {
    const people = this.getPeopleClient(accessToken);

    // Buscar si ya existe el grupo con ese nombre
    const listRes = await people.contactGroups.list({ pageSize: 100 });
    const existing = listRes.data.contactGroups?.find((g) => g.name === name);
    if (existing?.resourceName) return existing.resourceName;

    // Si no existe, crearlo
    const createRes = await people.contactGroups.create({
      requestBody: { contactGroup: { name } },
    });
    return createRes.data.resourceName!;
  }

  // Asignar contacto a un grupo
  async addContactToGroup(
    accessToken: string,
    groupResourceName: string,
    contactResourceName: string,
  ): Promise<void> {
    const people = this.getPeopleClient(accessToken);
    await people.contactGroups.members.modify({
      resourceName: groupResourceName,
      requestBody: {
        resourceNamesToAdd: [contactResourceName],
      },
    });
  }

  // Remover contacto de un grupo
  async removeContactFromGroup(
    accessToken: string,
    groupResourceName: string,
    contactResourceName: string,
  ): Promise<void> {
    const people = this.getPeopleClient(accessToken);
    await people.contactGroups.members.modify({
      resourceName: groupResourceName,
      requestBody: {
        resourceNamesToRemove: [contactResourceName],
      },
    });
  }

  // ─── Contacts CRUD ─────────────────────────────────────────────────

  async createContact(accessToken: string, data: ContactData): Promise<string> {
    const people = this.getPeopleClient(accessToken);
    const res = await people.people.createContact({
      requestBody: {
        names: [{ givenName: data.name }],
        phoneNumbers: [{ value: data.phone }],
        biographies: data.notes ? [{ value: data.notes }] : [],
      },
    });
    return res.data.resourceName!;
  }

  async updateContact(
    accessToken: string,
    resourceName: string,
    data: ContactData,
  ): Promise<void> {
    const people = this.getPeopleClient(accessToken);
    const current = await people.people.get({
      resourceName,
      personFields: 'names,phoneNumbers,biographies,metadata',
    });
    await people.people.updateContact({
      resourceName,
      updatePersonFields: 'names,phoneNumbers,biographies',
      requestBody: {
        etag: current.data.etag!,
        names: [{ givenName: data.name }],
        phoneNumbers: [{ value: data.phone }],
        biographies: data.notes ? [{ value: data.notes }] : [],
      },
    });
  }

  async deleteContact(
    accessToken: string,
    resourceName: string,
  ): Promise<void> {
    const people = this.getPeopleClient(accessToken);
    await people.people.deleteContact({ resourceName });
  }

  async listContacts(accessToken: string): Promise<GoogleContact[]> {
    const people = this.getPeopleClient(accessToken);
    const contacts: GoogleContact[] = [];
    let pageToken: string | undefined;

    do {
      const res = await people.people.connections.list({
        resourceName: 'people/me',
        personFields: 'names,phoneNumbers,biographies,metadata,memberships',
        pageSize: 1000,
        pageToken,
      });

      const connections = res.data.connections ?? [];

      for (const c of connections) {
        const name = c.names?.[0]?.givenName ?? '';
        const phone = c.phoneNumbers?.[0]?.value ?? '';
        if (!name && !phone) continue;

        contacts.push({
          resourceName: c.resourceName!,
          name,
          phone,
          notes: c.biographies?.[0]?.value ?? undefined,
          etag: c.etag ?? undefined,
        });
      }

      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return contacts;
  }
}
