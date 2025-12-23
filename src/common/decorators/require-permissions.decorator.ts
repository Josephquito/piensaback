import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSIONS_KEY = 'require_permissions';

/**
 * Ej:
 * @RequirePermissions('SUPPLIERS:CREATE')
 * @RequirePermissions('PRODUCTS:READ', 'CUSTOMERS:READ')
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
