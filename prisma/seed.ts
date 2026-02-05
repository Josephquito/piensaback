/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  PrismaClient,
  UserStatus,
  PermissionAction,
  PermissionResource,
  Prisma,
  BaseRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

type PermissionDef = {
  key: string;
  resource: PermissionResource;
  action: PermissionAction;
  group: string;
  label: string;
  order: number;
  isSystem?: boolean;
};

type PermissionRow = Pick<
  Prisma.PermissionGetPayload<{ select: { id: true; key: true } }>,
  'id' | 'key'
>;

async function upsertPermission(def: PermissionDef): Promise<PermissionRow> {
  return prisma.permission.upsert({
    where: { key: def.key },
    update: {
      resource: def.resource,
      action: def.action,
      group: def.group,
      label: def.label,
      order: def.order,
      isSystem: def.isSystem ?? true,
    },
    create: {
      key: def.key,
      resource: def.resource,
      action: def.action,
      group: def.group,
      label: def.label,
      order: def.order,
      isSystem: def.isSystem ?? true,
    },
    select: { id: true, key: true },
  });
}

async function grantUserPermissions(userId: number, permissionIds: number[]) {
  await prisma.userPermission.createMany({
    data: permissionIds.map((permissionId) => ({ userId, permissionId })),
    skipDuplicates: true,
  });
}

async function setRoleDefaults(role: BaseRole, permissionIds: number[]) {
  // idempotente: borra y vuelve a insertar
  await prisma.rolePermission.deleteMany({ where: { role } });
  await prisma.rolePermission.createMany({
    data: permissionIds.map((permissionId) => ({ role, permissionId })),
    skipDuplicates: true,
  });
}

async function main() {
  /**
   * ======================================================
   * 0) SUPERADMIN inicial (configurable por env)
   * ======================================================
   */
  const email = process.env.SEED_SUPERADMIN_EMAIL ?? 'josequito037@gmail.com';
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? 'Ellayyo.1234@';
  const passwordHash = await bcrypt.hash(password, 10);

  /**
   * ======================================================
   * 1) CATÁLOGO DE PERMISOS (UNO POR UNO)
   * ======================================================
   * Aquí están los que me pasaste (8 CRUD + 2 especiales).
   */
  const permissions: PermissionDef[] = [
    // ---- USERS ----
    {
      key: 'USERS:CREATE',
      resource: PermissionResource.USERS,
      action: PermissionAction.CREATE,
      group: 'Usuarios',
      label: 'Crear un usuario',
      order: 101,
    },
    {
      key: 'USERS:READ',
      resource: PermissionResource.USERS,
      action: PermissionAction.READ,
      group: 'Usuarios',
      label: 'Listar usuarios',
      order: 102,
    },
    {
      key: 'USERS:UPDATE',
      resource: PermissionResource.USERS,
      action: PermissionAction.UPDATE,
      group: 'Usuarios',
      label: 'Actualizar datos de un usuario',
      order: 103,
    },
    {
      key: 'USERS:DELETE',
      resource: PermissionResource.USERS,
      action: PermissionAction.DELETE,
      group: 'Usuarios',
      label: 'Eliminar a un usuario',
      order: 104,
    },

    // ---- PERMISSIONS (catálogo permisos) ----
    {
      key: 'PERMISSIONS:CREATE',
      resource: PermissionResource.PERMISSIONS,
      action: PermissionAction.CREATE,
      group: 'Configuración Superadmin',
      label: 'Crear un permiso',
      order: 201,
    },
    {
      key: 'PERMISSIONS:READ',
      resource: PermissionResource.PERMISSIONS,
      action: PermissionAction.READ,
      group: 'Permisos de usuarios',
      label: 'Listar los permisos existentes',
      order: 202,
    },

    {
      key: 'PERMISSIONS:DELETE',
      resource: PermissionResource.PERMISSIONS,
      action: PermissionAction.DELETE,
      group: 'Configuración Superadmin',
      label: 'Eliminar un permiso',
      order: 204,
    },

    // ✅ ---- ESPECIALES (los 2 que me diste) ----
    {
      key: 'PERMISSIONS-USERS:READ',
      resource: PermissionResource.PERMISSIONS,
      action: PermissionAction.READ,
      group: 'Permisos de usuarios',
      label: 'Listar los permisos que tiene un usuario',
      order: 251,
    },
    {
      key: 'PERMISSIONS-USERS:UPDATE',
      resource: PermissionResource.PERMISSIONS,
      action: PermissionAction.UPDATE,
      group: 'Permisos de usuarios',
      label: 'Asignar/Remover permisos de un usuario',
      order: 252,
    },
    // ---- COMPANIES ----
    {
      key: 'COMPANIES:CREATE',
      resource: PermissionResource.COMPANIES,
      action: PermissionAction.CREATE,
      group: 'Empresas',
      label: 'Crear una empresa',
      order: 301,
    },
    {
      key: 'COMPANIES:READ',
      resource: PermissionResource.COMPANIES,
      action: PermissionAction.READ,
      group: 'Empresas',
      label: 'Listar empresas',
      order: 302,
    },
    {
      key: 'COMPANIES:UPDATE',
      resource: PermissionResource.COMPANIES,
      action: PermissionAction.UPDATE,
      group: 'Empresas',
      label: 'Actualizar datos de una empresa',
      order: 303,
    },
    {
      key: 'COMPANIES:DELETE',
      resource: PermissionResource.COMPANIES,
      action: PermissionAction.DELETE,
      group: 'Empresas',
      label: 'Eliminar una empresa',
      order: 304,
    },

    // ---- COMPANIES → USERS ----
    {
      key: 'COMPANIES-USERS:READ',
      resource: PermissionResource.COMPANIES,
      action: PermissionAction.READ,
      group: 'Empresas',
      label: 'Ver usuarios asignados a una empresa',
      order: 311,
    },
    {
      key: 'COMPANIES-USERS:UPDATE',
      resource: PermissionResource.COMPANIES,
      action: PermissionAction.UPDATE,
      group: 'Empresas',
      label: 'Asignar o desasignar usuarios a una empresa',
      order: 312,
    },
    // ---- SUPPLIERS ----
    {
      key: 'SUPPLIERS:CREATE',
      resource: PermissionResource.SUPPLIERS,
      action: PermissionAction.CREATE,
      group: 'Proveedores',
      label: 'Crear un proveedor',
      order: 401,
    },
    {
      key: 'SUPPLIERS:READ',
      resource: PermissionResource.SUPPLIERS,
      action: PermissionAction.READ,
      group: 'Proveedores',
      label: 'Listar proveedores',
      order: 402,
    },
    {
      key: 'SUPPLIERS:UPDATE',
      resource: PermissionResource.SUPPLIERS,
      action: PermissionAction.UPDATE,
      group: 'Proveedores',
      label: 'Actualizar datos de un proveedor',
      order: 403,
    },
    {
      key: 'SUPPLIERS:DELETE',
      resource: PermissionResource.SUPPLIERS,
      action: PermissionAction.DELETE,
      group: 'Proveedores',
      label: 'Eliminar un proveedor',
      order: 404,
    },
    // ---- CUSTOMERS ----
    {
      key: 'CUSTOMERS:CREATE',
      resource: PermissionResource.CUSTOMERS,
      action: PermissionAction.CREATE,
      group: 'Clientes',
      label: 'Crear un cliente',
      order: 501,
    },
    {
      key: 'CUSTOMERS:READ',
      resource: PermissionResource.CUSTOMERS,
      action: PermissionAction.READ,
      group: 'Clientes',
      label: 'Listar clientes',
      order: 502,
    },
    {
      key: 'CUSTOMERS:UPDATE',
      resource: PermissionResource.CUSTOMERS,
      action: PermissionAction.UPDATE,
      group: 'Clientes',
      label: 'Actualizar datos de un cliente',
      order: 503,
    },
    {
      key: 'CUSTOMERS:DELETE',
      resource: PermissionResource.CUSTOMERS,
      action: PermissionAction.DELETE,
      group: 'Clientes',
      label: 'Eliminar un cliente',
      order: 504,
    },
    // ---- STREAMING PLATFORMS ----
    {
      key: 'STREAMING_PLATFORMS:CREATE',
      resource: PermissionResource.STREAMING_PLATFORMS,
      action: PermissionAction.CREATE,
      group: 'Streaming',
      label: 'Crear plataforma de streaming',
      order: 601,
    },
    {
      key: 'STREAMING_PLATFORMS:READ',
      resource: PermissionResource.STREAMING_PLATFORMS,
      action: PermissionAction.READ,
      group: 'Streaming',
      label: 'Listar plataformas de streaming',
      order: 602,
    },
    {
      key: 'STREAMING_PLATFORMS:UPDATE',
      resource: PermissionResource.STREAMING_PLATFORMS,
      action: PermissionAction.UPDATE,
      group: 'Streaming',
      label: 'Actualizar plataforma de streaming',
      order: 603,
    },
    {
      key: 'STREAMING_PLATFORMS:DELETE',
      resource: PermissionResource.STREAMING_PLATFORMS,
      action: PermissionAction.DELETE,
      group: 'Streaming',
      label: 'Eliminar plataforma de streaming',
      order: 604,
    },

    // ---- STREAMING ACCOUNTS ----
    {
      key: 'STREAMING_ACCOUNTS:CREATE',
      resource: PermissionResource.STREAMING_ACCOUNTS,
      action: PermissionAction.CREATE,
      group: 'Cuentas Streaming',
      label: 'Registrar compra de cuenta streaming',
      order: 611,
    },
    {
      key: 'STREAMING_ACCOUNTS:READ',
      resource: PermissionResource.STREAMING_ACCOUNTS,
      action: PermissionAction.READ,
      group: 'Cuentas Streaming',
      label: 'Listar cuentas streaming',
      order: 612,
    },
    {
      key: 'STREAMING_ACCOUNTS:UPDATE',
      resource: PermissionResource.STREAMING_ACCOUNTS,
      action: PermissionAction.UPDATE,
      group: 'Cuentas Streaming',
      label: 'Actualizar cuenta streaming (correo/clave/perfiles/fechas/costo)',
      order: 613,
    },
    {
      key: 'STREAMING_ACCOUNTS:DELETE',
      resource: PermissionResource.STREAMING_ACCOUNTS,
      action: PermissionAction.DELETE,
      group: 'Cuentas Streaming',
      label: 'Eliminar cuenta streaming',
      order: 614,
    },

    // ---- STREAMING SALES ----
    {
      key: 'STREAMING_SALES:CREATE',
      resource: PermissionResource.STREAMING_SALES,
      action: PermissionAction.CREATE,
      group: 'Ventas',
      label: 'Registrar venta de perfil',
      order: 621,
    },
    {
      key: 'STREAMING_SALES:READ',
      resource: PermissionResource.STREAMING_SALES,
      action: PermissionAction.READ,
      group: 'Ventas',
      label: 'Listar ventas de perfiles',
      order: 622,
    },
    {
      key: 'STREAMING_SALES:UPDATE',
      resource: PermissionResource.STREAMING_SALES,
      action: PermissionAction.UPDATE,
      group: 'Ventas',
      label: 'Actualizar venta de perfil (precio/días/cliente/observaciones)',
      order: 623,
    },
    {
      key: 'STREAMING_SALES:DELETE',
      resource: PermissionResource.STREAMING_SALES,
      action: PermissionAction.DELETE,
      group: 'Ventas',
      label: 'Eliminar venta de perfil',
      order: 624,
    },

    // ---- KARDEX ----
    {
      key: 'KARDEX:CREATE',
      resource: PermissionResource.KARDEX,
      action: PermissionAction.CREATE,
      group: 'Kardex',
      label: 'Registrar movimientos manuales de kardex',
      order: 631,
    },
    {
      key: 'KARDEX:READ',
      resource: PermissionResource.KARDEX,
      action: PermissionAction.READ,
      group: 'Kardex',
      label: 'Ver kardex y costos promedio',
      order: 632,
    },
    {
      key: 'KARDEX:UPDATE',
      resource: PermissionResource.KARDEX,
      action: PermissionAction.UPDATE,
      group: 'Kardex',
      label: 'Ajustar kardex (edición controlada)',
      order: 633,
    },
    {
      key: 'KARDEX:DELETE',
      resource: PermissionResource.KARDEX,
      action: PermissionAction.DELETE,
      group: 'Kardex',
      label: 'Eliminar movimiento de kardex',
      order: 634,
    },
  ];

  const createdPerms: PermissionRow[] = [];
  for (const p of permissions) createdPerms.push(await upsertPermission(p));

  const byKey = new Map(createdPerms.map((p) => [p.key, p.id]));
  const allPermissionIds = createdPerms.map((p) => p.id);

  /**
   * ======================================================
   * 2) SUPERADMIN inicial
   * ======================================================
   */
  const superadmin = await prisma.user.upsert({
    where: { email },
    update: {
      nombre: 'Joseph SuperAdmin',
      phone: '0969687989',
      status: UserStatus.ACTIVE,
      role: BaseRole.SUPERADMIN,
      passwordHash,
    },
    create: {
      email,
      nombre: 'Joseph SuperAdmin',
      phone: '0969687989',
      passwordHash,
      status: UserStatus.ACTIVE,
      role: BaseRole.SUPERADMIN,
    },
    select: { id: true, email: true },
  });

  /**
   * ======================================================
   * 3) SUPERADMIN = todos los permisos
   * ======================================================
   */
  await grantUserPermissions(superadmin.id, allPermissionIds);

  /**
   * ======================================================
   * 4) PERMISOS POR DEFECTO POR ROL (ROLE_PERMISSION)
   * ======================================================
   */
  const adminDefaultKeys = [
    'USERS:CREATE',
    'USERS:READ',
    'USERS:UPDATE',
    'USERS:DELETE',
    'PERMISSIONS:READ',
    'PERMISSIONS-USERS:READ',
    'PERMISSIONS-USERS:UPDATE',
    'COMPANIES:CREATE',
    'COMPANIES:READ',
    'COMPANIES:UPDATE',
    'COMPANIES:DELETE',
    'COMPANIES-USERS:READ',
    'COMPANIES-USERS:UPDATE',
    'SUPPLIERS:CREATE',
    'SUPPLIERS:READ',
    'SUPPLIERS:UPDATE',
    'SUPPLIERS:DELETE',
    'CUSTOMERS:CREATE',
    'CUSTOMERS:READ',
    'CUSTOMERS:UPDATE',
    'CUSTOMERS:DELETE',
    'STREAMING_PLATFORMS:CREATE',
    'STREAMING_PLATFORMS:READ',
    'STREAMING_PLATFORMS:UPDATE',
    'STREAMING_PLATFORMS:DELETE',
    'STREAMING_ACCOUNTS:CREATE',
    'STREAMING_ACCOUNTS:READ',
    'STREAMING_ACCOUNTS:UPDATE',
    'STREAMING_ACCOUNTS:DELETE',
    'STREAMING_SALES:CREATE',
    'STREAMING_SALES:READ',
    'STREAMING_SALES:UPDATE',
    'STREAMING_SALES:DELETE',
    'KARDEX:CREATE',
    'KARDEX:READ',
    'KARDEX:UPDATE',
    'KARDEX:DELETE',
  ];

  const employeeDefaultKeys = ['USERS:READ'];

  function idsFromKeys(keys: string[]) {
    return keys.map((k) => {
      const id = byKey.get(k);
      if (!id) throw new Error(`Seed error: no existe permiso con key ${k}`);
      return id;
    });
  }

  await setRoleDefaults(BaseRole.ADMIN, idsFromKeys(adminDefaultKeys));
  await setRoleDefaults(BaseRole.EMPLOYEE, idsFromKeys(employeeDefaultKeys));

  console.log('✅ Seed ejecutado correctamente');
  console.log('SUPERADMIN:', email, password);
  console.log(
    'Permisos creados:',
    createdPerms.map((p) => p.key),
  );
  console.log('Defaults ADMIN:', adminDefaultKeys);
  console.log('Defaults EMPLOYEE:', employeeDefaultKeys);
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
