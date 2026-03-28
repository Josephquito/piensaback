import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleContactsService } from './google-contacts.service';

@Injectable()
export class GoogleAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleContacts: GoogleContactsService,
  ) {}

  private createOAuthClient(): OAuth2Client {
    return new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  getAuthUrl(companyId: number): string {
    const client = this.createOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/contacts'],
      state: String(companyId),
    });
  }

  async handleCallback(code: string, companyId: number): Promise<void> {
    const client = this.createOAuthClient();
    const { tokens } = await client.getToken(code);

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        googleRefreshToken: tokens.refresh_token ?? undefined,
        googleConnected: true,
      },
    });

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { googleGroupCustomers: true, googleGroupSuppliers: true },
    });

    const accessToken = await this.getAccessToken(companyId);
    const updates: Record<string, string> = {};

    if (!company?.googleGroupCustomers) {
      updates.googleGroupCustomers =
        await this.googleContacts.findOrCreateGroup(accessToken, 'Clientes');
    }

    if (!company?.googleGroupSuppliers) {
      updates.googleGroupSuppliers =
        await this.googleContacts.findOrCreateGroup(accessToken, 'Proveedores');
    }

    if (Object.keys(updates).length > 0) {
      await this.prisma.company.update({
        where: { id: companyId },
        data: updates,
      });
    }
  }

  async getAccessToken(companyId: number): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { googleRefreshToken: true },
    });

    if (!company?.googleRefreshToken) {
      throw new Error(`Company ${companyId} no tiene Google conectado.`);
    }

    const client = this.createOAuthClient();
    client.setCredentials({ refresh_token: company.googleRefreshToken });

    const { token } = await client.getAccessToken();
    if (!token) throw new Error('No se pudo obtener access token de Google.');

    return token;
  }

  async disconnect(companyId: number): Promise<void> {
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        googleRefreshToken: null,
        googleConnected: false,
        googleGroupCustomers: null,
        googleGroupSuppliers: null,
      },
    });
  }

  async getStatus(
    companyId: number,
  ): Promise<{ connected: boolean; email: string | null }> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { googleConnected: true, googleRefreshToken: true },
    });

    if (!company?.googleConnected || !company.googleRefreshToken) {
      return { connected: false, email: null };
    }

    try {
      const accessToken = await this.getAccessToken(companyId);
      const { google } = await import('googleapis');
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const people = google.people({ version: 'v1', auth });

      const res = await people.people.get({
        resourceName: 'people/me',
        personFields: 'emailAddresses',
      });

      const email = res.data.emailAddresses?.[0]?.value ?? null;
      return { connected: true, email };
    } catch {
      return { connected: true, email: null };
    }
  }
}
