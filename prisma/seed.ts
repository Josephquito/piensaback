import {
  PrismaClient,
  UserStatus,
  PermissionAction,
  PermissionResource,
  BaseRole,
  Prisma,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// =======================
// TIPOS
// =======================

type PermissionDef = {
  key: string;
  resource: PermissionResource;
  action: PermissionAction;
  group: string;
  label: string;
  order: number;
  isSystem: boolean; // true = interno/oculto, solo SUPERADMIN | false = visible/asignable
};

type PermissionRow = Pick<
  Prisma.PermissionGetPayload<{
    select: { id: true; key: true; isSystem: true };
  }>,
  'id' | 'key' | 'isSystem'
>;

// =======================
// HELPERS
// =======================

async function upsertPermission(def: PermissionDef): Promise<PermissionRow> {
  return prisma.permission.upsert({
    where: { key: def.key },
    update: {
      resource: def.resource,
      action: def.action,
      group: def.group,
      label: def.label,
      order: def.order,
      isSystem: def.isSystem,
    },
    create: {
      key: def.key,
      resource: def.resource,
      action: def.action,
      group: def.group,
      label: def.label,
      order: def.order,
      isSystem: def.isSystem,
    },
    select: { id: true, key: true, isSystem: true },
  });
}

async function grantUserPermissions(userId: number, permissionIds: number[]) {
  await prisma.userPermission.createMany({
    data: permissionIds.map((permissionId) => ({ userId, permissionId })),
    skipDuplicates: true,
  });
}

// =======================
// CATÁLOGO DE PERMISOS
// =======================
//
// isSystem: true  → interno/oculto — no aparece en el front, solo SUPERADMIN lo tiene
// isSystem: false → visible/asignable — aparece en el front, ADMIN puede asignarlo a EMPLOYEE
//
// Permisos internos (5):
//   PERMISSIONS:CREATE, PERMISSIONS:UPDATE, PERMISSIONS:DELETE
//   COMPANIES:DELETE, USERS:DELETE

const permissions: PermissionDef[] = [
  // ── USERS ────────────────────────────────────────────────────────────────
  {
    key: 'USERS:CREATE',
    resource: PermissionResource.USERS,
    action: PermissionAction.CREATE,
    group: 'Usuarios',
    label: 'Crear usuario',
    order: 101,
    isSystem: false,
  },
  {
    key: 'USERS:READ',
    resource: PermissionResource.USERS,
    action: PermissionAction.READ,
    group: 'Usuarios',
    label: 'Ver y listar usuarios',
    order: 102,
    isSystem: false,
  },
  {
    key: 'USERS:UPDATE',
    resource: PermissionResource.USERS,
    action: PermissionAction.UPDATE,
    group: 'Usuarios',
    label: 'Editar datos de un usuario',
    order: 103,
    isSystem: false,
  },
  {
    key: 'USERS:DELETE',
    resource: PermissionResource.USERS,
    action: PermissionAction.DELETE,
    group: 'Usuarios',
    label: 'Eliminar usuario',
    order: 104,
    isSystem: true, // solo SUPERADMIN
  },

  // ── PERMISSIONS — catálogo ────────────────────────────────────────────────
  {
    key: 'PERMISSIONS:CREATE',
    resource: PermissionResource.PERMISSIONS,
    action: PermissionAction.CREATE,
    group: 'Catálogo de permisos',
    label: 'Crear permiso en el catálogo',
    order: 201,
    isSystem: true, // solo SUPERADMIN
  },
  {
    key: 'PERMISSIONS:READ',
    resource: PermissionResource.PERMISSIONS,
    action: PermissionAction.READ,
    group: 'Catálogo de permisos',
    label: 'Ver y listar permisos del catálogo',
    order: 202,
    isSystem: false,
  },
  {
    key: 'PERMISSIONS:UPDATE',
    resource: PermissionResource.PERMISSIONS,
    action: PermissionAction.UPDATE,
    group: 'Catálogo de permisos',
    label: 'Editar permiso del catálogo',
    order: 203,
    isSystem: true, // solo SUPERADMIN
  },
  {
    key: 'PERMISSIONS:DELETE',
    resource: PermissionResource.PERMISSIONS,
    action: PermissionAction.DELETE,
    group: 'Catálogo de permisos',
    label: 'Eliminar permiso del catálogo',
    order: 204,
    isSystem: true, // solo SUPERADMIN
  },

  // ── PERMISSIONS — por usuario ─────────────────────────────────────────────
  {
    key: 'PERMISSIONS-USERS:READ',
    resource: PermissionResource.PERMISSIONS,
    action: PermissionAction.READ,
    group: 'Permisos de usuario',
    label: 'Ver permisos asignados a un usuario',
    order: 211,
    isSystem: false,
  },
  {
    key: 'PERMISSIONS-USERS:UPDATE',
    resource: PermissionResource.PERMISSIONS,
    action: PermissionAction.UPDATE,
    group: 'Permisos de usuario',
    label: 'Asignar y remover permisos de un usuario',
    order: 212,
    isSystem: false,
  },

  // ── COMPANIES ─────────────────────────────────────────────────────────────
  {
    key: 'COMPANIES:CREATE',
    resource: PermissionResource.COMPANIES,
    action: PermissionAction.CREATE,
    group: 'Empresas',
    label: 'Crear empresa',
    order: 301,
    isSystem: false,
  },
  {
    key: 'COMPANIES:READ',
    resource: PermissionResource.COMPANIES,
    action: PermissionAction.READ,
    group: 'Empresas',
    label: 'Ver y listar empresas',
    order: 302,
    isSystem: false,
  },
  {
    key: 'COMPANIES:UPDATE',
    resource: PermissionResource.COMPANIES,
    action: PermissionAction.UPDATE,
    group: 'Empresas',
    label: 'Editar datos de una empresa',
    order: 303,
    isSystem: false,
  },
  {
    key: 'COMPANIES:DELETE',
    resource: PermissionResource.COMPANIES,
    action: PermissionAction.DELETE,
    group: 'Empresas',
    label: 'Eliminar empresa',
    order: 304,
    isSystem: true, // solo SUPERADMIN
  },

  // ── COMPANIES — miembros ──────────────────────────────────────────────────
  {
    key: 'COMPANIES-USERS:READ',
    resource: PermissionResource.COMPANIES,
    action: PermissionAction.READ,
    group: 'Miembros de empresa',
    label: 'Ver usuarios asignados a una empresa',
    order: 311,
    isSystem: false,
  },
  {
    key: 'COMPANIES-USERS:UPDATE',
    resource: PermissionResource.COMPANIES,
    action: PermissionAction.UPDATE,
    group: 'Miembros de empresa',
    label: 'Asignar y desasignar usuarios de una empresa',
    order: 312,
    isSystem: false,
  },

  // ── SUPPLIERS ─────────────────────────────────────────────────────────────
  {
    key: 'SUPPLIERS:CREATE',
    resource: PermissionResource.SUPPLIERS,
    action: PermissionAction.CREATE,
    group: 'Proveedores',
    label: 'Crear proveedor',
    order: 401,
    isSystem: false,
  },
  {
    key: 'SUPPLIERS:READ',
    resource: PermissionResource.SUPPLIERS,
    action: PermissionAction.READ,
    group: 'Proveedores',
    label: 'Ver, listar proveedores y sus cuentas',
    order: 402,
    isSystem: false,
  },
  {
    key: 'SUPPLIERS:UPDATE',
    resource: PermissionResource.SUPPLIERS,
    action: PermissionAction.UPDATE,
    group: 'Proveedores',
    label: 'Editar proveedor y ajustar su saldo',
    order: 403,
    isSystem: false,
  },
  {
    key: 'SUPPLIERS:DELETE',
    resource: PermissionResource.SUPPLIERS,
    action: PermissionAction.DELETE,
    group: 'Proveedores',
    label: 'Eliminar proveedor',
    order: 404,
    isSystem: false,
  },

  // ── CUSTOMERS ─────────────────────────────────────────────────────────────
  {
    key: 'CUSTOMERS:CREATE',
    resource: PermissionResource.CUSTOMERS,
    action: PermissionAction.CREATE,
    group: 'Clientes',
    label: 'Crear cliente e importar desde CSV',
    order: 501,
    isSystem: false,
  },
  {
    key: 'CUSTOMERS:READ',
    resource: PermissionResource.CUSTOMERS,
    action: PermissionAction.READ,
    group: 'Clientes',
    label: 'Ver, listar, exportar clientes e historial',
    order: 502,
    isSystem: false,
  },
  {
    key: 'CUSTOMERS:UPDATE',
    resource: PermissionResource.CUSTOMERS,
    action: PermissionAction.UPDATE,
    group: 'Clientes',
    label: 'Editar datos de un cliente',
    order: 503,
    isSystem: false,
  },
  {
    key: 'CUSTOMERS:DELETE',
    resource: PermissionResource.CUSTOMERS,
    action: PermissionAction.DELETE,
    group: 'Clientes',
    label: 'Eliminar cliente',
    order: 504,
    isSystem: false,
  },

  // ── STREAMING_PLATFORMS ───────────────────────────────────────────────────
  {
    key: 'STREAMING_PLATFORMS:CREATE',
    resource: PermissionResource.STREAMING_PLATFORMS,
    action: PermissionAction.CREATE,
    group: 'Plataformas',
    label: 'Crear plataforma de streaming',
    order: 601,
    isSystem: false,
  },
  {
    key: 'STREAMING_PLATFORMS:READ',
    resource: PermissionResource.STREAMING_PLATFORMS,
    action: PermissionAction.READ,
    group: 'Plataformas',
    label: 'Ver y listar plataformas',
    order: 602,
    isSystem: false,
  },
  {
    key: 'STREAMING_PLATFORMS:UPDATE',
    resource: PermissionResource.STREAMING_PLATFORMS,
    action: PermissionAction.UPDATE,
    group: 'Plataformas',
    label: 'Editar plataforma de streaming',
    order: 603,
    isSystem: false,
  },
  {
    key: 'STREAMING_PLATFORMS:DELETE',
    resource: PermissionResource.STREAMING_PLATFORMS,
    action: PermissionAction.DELETE,
    group: 'Plataformas',
    label: 'Eliminar plataforma de streaming',
    order: 604,
    isSystem: false,
  },

  // ── STREAMING_ACCOUNTS ────────────────────────────────────────────────────
  {
    key: 'STREAMING_ACCOUNTS:CREATE',
    resource: PermissionResource.STREAMING_ACCOUNTS,
    action: PermissionAction.CREATE,
    group: 'Cuentas streaming',
    label: 'Registrar compra de cuenta streaming',
    order: 611,
    isSystem: false,
  },
  {
    key: 'STREAMING_ACCOUNTS:READ',
    resource: PermissionResource.STREAMING_ACCOUNTS,
    action: PermissionAction.READ,
    group: 'Cuentas streaming',
    label: 'Ver y listar cuentas streaming',
    order: 612,
    isSystem: false,
  },
  {
    key: 'STREAMING_ACCOUNTS:UPDATE',
    resource: PermissionResource.STREAMING_ACCOUNTS,
    action: PermissionAction.UPDATE,
    group: 'Cuentas streaming',
    label: 'Editar, renovar, reemplazar y corregir costo de cuenta',
    order: 613,
    isSystem: false,
  },
  {
    key: 'STREAMING_ACCOUNTS:DELETE',
    resource: PermissionResource.STREAMING_ACCOUNTS,
    action: PermissionAction.DELETE,
    group: 'Cuentas streaming',
    label: 'Eliminar cuenta streaming',
    order: 614,
    isSystem: false,
  },

  // ── STREAMING_SALES ───────────────────────────────────────────────────────
  {
    key: 'STREAMING_SALES:CREATE',
    resource: PermissionResource.STREAMING_SALES,
    action: PermissionAction.CREATE,
    group: 'Ventas',
    label: 'Registrar venta de perfil',
    order: 621,
    isSystem: false,
  },
  {
    key: 'STREAMING_SALES:READ',
    resource: PermissionResource.STREAMING_SALES,
    action: PermissionAction.READ,
    group: 'Ventas',
    label: 'Ver y listar ventas',
    order: 622,
    isSystem: false,
  },
  {
    key: 'STREAMING_SALES:UPDATE',
    resource: PermissionResource.STREAMING_SALES,
    action: PermissionAction.UPDATE,
    group: 'Ventas',
    label: 'Editar, renovar, pausar, transferir, reembolsar y vaciar perfiles',
    order: 623,
    isSystem: false,
  },

  // ── KARDEX ────────────────────────────────────────────────────────────────
  {
    key: 'KARDEX:READ',
    resource: PermissionResource.KARDEX,
    action: PermissionAction.READ,
    group: 'Kardex',
    label: 'Ver stock, movimientos y costos promedio por plataforma',
    order: 701,
    isSystem: false,
  },
];

// =======================
// MAIN
// =======================

async function main() {
  // ── 1) Permisos ───────────────────────────────────────────────────────────
  console.log('⏳ Creando/actualizando permisos...');
  const createdPerms: PermissionRow[] = [];
  for (const p of permissions) {
    createdPerms.push(await upsertPermission(p));
  }

  const internalCount = createdPerms.filter((p) => p.isSystem).length;
  const visibleCount = createdPerms.filter((p) => !p.isSystem).length;
  console.log(
    `✅ ${createdPerms.length} permisos listos (${visibleCount} visibles · ${internalCount} internos)`,
  );

  // IDs útiles
  const allPermissionIds = createdPerms.map((p) => p.id);
  const adminPermissionIds = createdPerms
    .filter((p) => !p.isSystem)
    .map((p) => p.id);

  // ── 2) SUPERADMIN ─────────────────────────────────────────────────────────
  const email = process.env.SEED_SUPERADMIN_EMAIL ?? 'josequito037@gmail.com';
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? 'Ellayyo.1234@';
  const passwordHash = await bcrypt.hash(password, 10);

  console.log('⏳ Creando/actualizando superadmin...');
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
  console.log(
    `✅ Superadmin listo → id: ${superadmin.id} | email: ${superadmin.email}`,
  );

  // ── 3) SUPERADMIN recibe los 36 permisos ──────────────────────────────────
  console.log('⏳ Asignando permisos al superadmin...');
  await grantUserPermissions(superadmin.id, allPermissionIds);
  console.log(`✅ ${allPermissionIds.length} permisos asignados al superadmin`);

  // ── RESUMEN ───────────────────────────────────────────────────────────────
  console.log('\n🚀 Seed completado correctamente');
  console.log('─────────────────────────────────────────────────────────');
  console.log(`Email        : ${email}`);
  console.log(`Password     : ${password}`);
  console.log(`Total perms  : ${createdPerms.length}`);
  console.log(`  Visibles   : ${visibleCount}  → asignables a ADMIN/EMPLOYEE`);
  console.log(`  Internos   : ${internalCount}  → solo SUPERADMIN`);
  console.log('─────────────────────────────────────────────────────────');
  console.log('Defaults por rol al crear usuario:');
  console.log(
    `  SUPERADMIN → ${allPermissionIds.length} permisos (solo via seed)`,
  );
  console.log(
    `  ADMIN      → ${adminPermissionIds.length} permisos (todos los visibles)`,
  );
  console.log(`  EMPLOYEE   → 0 permisos (pendiente definir)`);
  console.log('─────────────────────────────────────────────────────────');

  // ── NOTA PARA EL SERVICE ──────────────────────────────────────────────────
  //
  // En users.service.ts, al crear un usuario nuevo, aplicar defaults así:
  //
  //   import { ADMIN_DEFAULT_PERMISSION_KEYS } from '../common/constants/role-permissions.constants';
  //
  //   const defaultKeys =
  //     role === BaseRole.ADMIN    ? ADMIN_DEFAULT_PERMISSION_KEYS :
  //     role === BaseRole.EMPLOYEE ? EMPLOYEE_DEFAULT_PERMISSION_KEYS :
  //     [];
  //
  //   if (defaultKeys.length) {
  //     const perms = await prisma.permission.findMany({
  //       where: { key: { in: defaultKeys } },
  //       select: { id: true },
  //     });
  //     await prisma.userPermission.createMany({
  //       data: perms.map((p) => ({ userId: newUser.id, permissionId: p.id })),
  //       skipDuplicates: true,
  //     });
  //   }
  //
  // Y en role-permissions.constants.ts exportar:
  //
  //   export const ADMIN_DEFAULT_PERMISSION_KEYS = [
  //     todos los keys con isSystem: false
  //   ];
  //
  //   export const EMPLOYEE_DEFAULT_PERMISSION_KEYS: string[] = [
  //     // pendiente definir
  //   ];
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
