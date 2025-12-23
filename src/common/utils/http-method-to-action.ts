/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { PermissionAction } from '@prisma/client';

export function httpMethodToAction(method: string): PermissionAction | null {
  const m = (method || '').toUpperCase();

  if (m === 'GET') return PermissionAction.READ;
  if (m === 'POST') return PermissionAction.CREATE;
  if (m === 'PATCH' || m === 'PUT') return PermissionAction.UPDATE;
  if (m === 'DELETE') return PermissionAction.DELETE;

  return null;
}
