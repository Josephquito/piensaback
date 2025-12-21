import { PrismaClient, RoleScope, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Roles
  const [superadminRole, adminRole, employeeRole] = await Promise.all([
    prisma.role.upsert({
      where: { name: 'SUPERADMIN' },
      update: {},
      create: {
        name: 'SUPERADMIN',
        scope: RoleScope.GLOBAL,
        description: 'SaaS Super Admin',
      },
    }),
    prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: {
        name: 'ADMIN',
        scope: RoleScope.COMPANY,
        description: 'Administrador de empresa',
      },
    }),
    prisma.role.upsert({
      where: { name: 'EMPLOYEE' },
      update: {},
      create: {
        name: 'EMPLOYEE',
        scope: RoleScope.COMPANY,
        description: 'Empleado de empresa',
      },
    }),
  ]);

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
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: { userId: superadmin.id, roleId: superadminRole.id },
    },
    update: {},
    create: { userId: superadmin.id, roleId: superadminRole.id },
  });

  console.log('Seed OK');
  console.log('SUPERADMIN:', email, password);
  console.log('Roles:', { superadminRole, adminRole, employeeRole });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
