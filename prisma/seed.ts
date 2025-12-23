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
   * 1) ROLES
   * ======================================================
   */
  await prisma.role.createMany({
    data: [
      {
        name: 'SUPERADMIN',
        scope: RoleScope.GLOBAL,
        description: 'SaaS Super Admin',
      },
      {
        name: 'ADMIN',
        scope: RoleScope.COMPANY,
        description: 'Administrador de empresa',
      },
      {
        name: 'EMPLOYEE',
        scope: RoleScope.COMPANY,
        description: 'Empleado de empresa',
      },
    ],
    skipDuplicates: true,
  });

  const superadminRole = await prisma.role.findUnique({
    where: { name: 'SUPERADMIN' },
  });
  const adminRole = await prisma.role.findUnique({
    where: { name: 'ADMIN' },
  });
  const employeeRole = await prisma.role.findUnique({
    where: { name: 'EMPLOYEE' },
  });

  if (!superadminRole || !adminRole || !employeeRole) {
    throw new Error('Roles no encontrados');
  }

  /**
   * ======================================================
   * 2) PERMISOS (CATÁLOGO GLOBAL)
   * ======================================================
   */
  const resources = ['SUPPLIERS', 'CUSTOMERS', 'PRODUCTS', 'MEMBERS'] as const;
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
   * 3) ASIGNAR CRUD COMPLETO AL ROL ADMIN
   * ======================================================
   */
  const adminPermissions = await prisma.permission.findMany({
    where: {
      resource: { in: resources as unknown as string[] },
    },
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
   * 4) SUPERADMIN GLOBAL (USER + USER_ROLE)
   * ======================================================
   */
  const email = 'josequito037@gmail.com';
  const password = 'Ellayyo.123@';
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
  console.log('Roles:', {
    SUPERADMIN: superadminRole.id,
    ADMIN: adminRole.id,
    EMPLOYEE: employeeRole.id,
  });
  console.log(
    'Permisos ADMIN:',
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
