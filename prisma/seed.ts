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
  resource: PermissionResource;
  action: PermissionAction;
  group: string;
  label: string;
  order: number;
  isSystem: boolean;
};

type PermissionRow = Pick<
  Prisma.PermissionGetPayload<{
    select: { id: true; key: true };
  }>,
  'id' | 'key'
>;

function permKey(resource: PermissionResource, action: PermissionAction) {
  return `${resource}:${action}`;
}

async function upsertPermission(def: PermissionDef): Promise<PermissionRow> {
  const key = permKey(def.resource, def.action);

  return prisma.permission.upsert({
    where: { key },
    update: {
      resource: def.resource,
      action: def.action,
      group: def.group,
      label: def.label,
      order: def.order,
      isSystem: def.isSystem,
    },
    create: {
      resource: def.resource,
      action: def.action,
      key,
      group: def.group,
      label: def.label,
      order: def.order,
      isSystem: def.isSystem,
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

function labelFor(resource: PermissionResource) {
  switch (resource) {
    case PermissionResource.USERS:
      return 'Usuarios';
    case PermissionResource.PERMISSIONS:
      return 'Permisos';
    case PermissionResource.COMPANIES:
      return 'Empresas';
    default:
      return String(resource);
  }
}

function actionLabel(action: PermissionAction) {
  switch (action) {
    case PermissionAction.CREATE:
      return 'Crear';
    case PermissionAction.READ:
      return 'Ver';
    case PermissionAction.UPDATE:
      return 'Editar';
    case PermissionAction.DELETE:
      return 'Eliminar';
    default:
      return String(action);
  }
}

async function main() {
  /**
   * ======================================================
   * 0) SUPERADMIN inicial (configurable por env)
   * ======================================================
   */
  const email = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@local.test';
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? 'SuperAdmin123!';

  /**
   * ======================================================
   * 1) PERMISOS del sistema (solo tus módulos reales)
   * ======================================================
   */
  const actions: PermissionAction[] = [
    PermissionAction.CREATE,
    PermissionAction.READ,
    PermissionAction.UPDATE,
    PermissionAction.DELETE,
  ];

  const permissionDefs: PermissionDef[] = [];

  function pushCrud(
    resource: PermissionResource,
    group: string,
    baseOrder: number,
  ) {
    actions.forEach((action, idx) => {
      permissionDefs.push({
        resource,
        action,
        group,
        label: `${actionLabel(action)} ${labelFor(resource)}`,
        order: baseOrder + (idx + 1),
        isSystem: true,
      });
    });
  }

  // Solo módulos existentes: users, permissions, companies
  pushCrud(PermissionResource.USERS, 'Configuración', 100);
  pushCrud(PermissionResource.PERMISSIONS, 'Configuración', 200);
  pushCrud(PermissionResource.COMPANIES, 'Empresas', 300);

  const createdPerms: PermissionRow[] = [];
  for (const def of permissionDefs) {
    createdPerms.push(await upsertPermission(def));
  }

  const allPermissionIds = createdPerms.map((p) => p.id);

  /**
   * ======================================================
   * 2) SUPERADMIN inicial (USER)
   * ======================================================
   */
  const passwordHash = await bcrypt.hash(password, 10);

  const superadmin = await prisma.user.upsert({
    where: { email },
    update: {
      // No piso el password aquí a menos que quieras (yo sí lo actualizo para consistencia)
      nombre: 'SuperAdmin',
      phone: '0000000000',
      status: UserStatus.ACTIVE,
      role: BaseRole.SUPERADMIN,
      passwordHash,
    },
    create: {
      email,
      nombre: 'SuperAdmin',
      phone: '0000000000',
      passwordHash,
      status: UserStatus.ACTIVE,
      role: BaseRole.SUPERADMIN,
    },
    select: { id: true, email: true },
  });

  /**
   * ======================================================
   * 3) ASIGNAR PERMISOS al SUPERADMIN (USER_PERMISSION)
   * ======================================================
   */
  await grantUserPermissions(superadmin.id, allPermissionIds);

  console.log('✅ Seed ejecutado correctamente');
  console.log('SUPERADMIN:', email, password);
  console.log(
    'Permisos creados:',
    createdPerms.map((p) => p.key),
  );
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
