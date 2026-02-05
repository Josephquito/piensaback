import { BaseRole } from '@prisma/client';

export type CurrentUserJwt = {
  id: number;
  email: string;
  role: BaseRole; // SUPERADMIN | ADMIN | EMPLOYEE
  permissions: string[]; // permission keys
};
