/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  PrismaClient,
  RoleScope,
  UserStatus,
  PermissionAction,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  /**
   * ======================================================
   * 0) CONFIG SUPERADMIN INICIAL (cámbialo por env si quieres)
   * ======================================================
   */
  const email = 'josequito037@gmail.com';
  const password = 'Ellayyo.123@';

  /**
   * ======================================================
   * 1) ROLES BASE (ownerUserId = null)
   * ======================================================
   * Usamos upsert por key (único) para que no duplique jamás.
   */
  const superadminRole = await prisma.role.upsert({
    where: { key: 'BASE:SUPERADMIN' },
    update: {
      name: 'SUPERADMIN',
      scope: RoleScope.GLOBAL,
      description: 'SaaS Super Admin (base)',
      ownerUserId: null,
    },
    create: {
      key: 'BASE:SUPERADMIN',
      name: 'SUPERADMIN',
      scope: RoleScope.GLOBAL,
      description: 'SaaS Super Admin (base)',
      ownerUserId: null,
    },
    select: { id: true, key: true, name: true },
  });

  const adminRole = await prisma.role.upsert({
    where: { key: 'BASE:ADMIN' },
    update: {
      name: 'ADMIN',
      scope: RoleScope.GLOBAL,
      description: 'Admin (base)',
      ownerUserId: null,
    },
    create: {
      key: 'BASE:ADMIN',
      name: 'ADMIN',
      scope: RoleScope.GLOBAL,
      description: 'Admin (base)',
      ownerUserId: null,
    },
    select: { id: true, key: true, name: true },
  });

  const employeeRole = await prisma.role.upsert({
    where: { key: 'BASE:EMPLOYEE' },
    update: {
      name: 'EMPLOYEE',
      scope: RoleScope.GLOBAL,
      description: 'Employee (base, no editable)',
      ownerUserId: null,
    },
    create: {
      key: 'BASE:EMPLOYEE',
      name: 'EMPLOYEE',
      scope: RoleScope.GLOBAL,
      description: 'Employee (base, no editable)',
      ownerUserId: null,
    },
    select: { id: true, key: true, name: true },
  });

  /**
   * ======================================================
   * 2) PERMISOS (CATÁLOGO GLOBAL)
   * ======================================================
   */
  const resources = [
    'SUPPLIERS',
    'CUSTOMERS',
    'PRODUCTS',
    'MEMBERS',
    'ACCOUNTS',
    'SLOTS',
    'INVENTORY',
  ] as const;

  const actions = [
    PermissionAction.CREATE,
    PermissionAction.READ,
    PermissionAction.UPDATE,
    PermissionAction.DELETE,
  ];

  for (const resource of resources) {
    for (const action of actions) {
      const key = `${resource}:${action}`;

      await prisma.permission.upsert({
        where: { key },
        update: {},
        create: {
          resource,
          action,
          key,
        },
      });
    }
  }

  /**
   * ======================================================
   * 3) ASIGNAR CRUD COMPLETO AL ROL BASE ADMIN (opcional)
   * ======================================================
   * Si luego quieres que SOLO algunos recursos estén para ADMIN, ajusta aquí.
   */
  const adminPermissions = await prisma.permission.findMany({
    where: { resource: { in: resources as unknown as string[] } },
    select: { id: true, key: true },
  });

  for (const perm of adminPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: perm.id,
      },
    });
  }

  /**
   * ======================================================
   * 4) SUPERADMIN INICIAL (USER + USER_ROLE)
   * ======================================================
   */
  const passwordHash = await bcrypt.hash(password, 10);

  const superadmin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      nombre: 'Joseph Quito SuperAdmin',
      phone: '0969687989',
      passwordHash,
      status: UserStatus.ACTIVE,
    },
    select: { id: true, email: true },
  });

  // asignar rol SUPERADMIN base al usuario
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: superadmin.id,
        roleId: superadminRole.id,
      },
    },
    update: {},
    create: {
      userId: superadmin.id,
      roleId: superadminRole.id,
    },
  });

  /**
   * ======================================================
   * DONE
   * ======================================================
   */
  console.log('✅ Seed ejecutado correctamente');
  console.log('SUPERADMIN:', email, password);
  console.log('Roles base:', {
    SUPERADMIN: superadminRole.id,
    ADMIN: adminRole.id,
    EMPLOYEE: employeeRole.id,
  });
  console.log(
    'Permisos asignados a ADMIN:',
    adminPermissions.map((p) => p.key),
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
