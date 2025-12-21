import { PrismaClient, RoleScope, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // 1) Crear roles (id autoincrement debe existir en DB)
  await prisma.role.createMany({
    data: [
      {
        name: 'SUPERADMIN',
        scope: RoleScope.GLOBAL,
        description: 'SaaS Super Admin',
      },
      {
        name: 'ADMIN',
        scope: RoleScope.COMPANY, // como lo tenías
        description: 'Administrador de empresa',
      },
      {
        name: 'EMPLOYEE',
        scope: RoleScope.COMPANY, // como lo tenías
        description: 'Empleado de empresa',
      },
    ],
    skipDuplicates: true,
  });

  // 2) Obtener roles (con sus IDs)
  const superadminRole = await prisma.role.findUnique({
    where: { name: 'SUPERADMIN' },
    select: { id: true, name: true, scope: true },
  });
  const adminRole = await prisma.role.findUnique({
    where: { name: 'ADMIN' },
    select: { id: true, name: true, scope: true },
  });
  const employeeRole = await prisma.role.findUnique({
    where: { name: 'EMPLOYEE' },
    select: { id: true, name: true, scope: true },
  });

  if (!superadminRole || !adminRole || !employeeRole) {
    throw new Error(
      'No se pudieron crear/encontrar los roles (SUPERADMIN/ADMIN/EMPLOYEE).',
    );
  }

  // 3) Crear SUPERADMIN
  const email = 'josequito037@gmail.com';
  const password = 'Ellayyo.123@';
  const passwordHash = await bcrypt.hash(password, 10);

  const superadmin = await prisma.user.upsert({
    where: { email },
    update: {}, // si quieres actualizar nombre/teléfono cuando exista, aquí lo pones
    create: {
      email,
      nombre: 'Joseph Quito SuperAdmin',
      phone: '0969687989',
      passwordHash,
      status: UserStatus.ACTIVE,
      // createdByUserId: null
    },
    select: { id: true, email: true },
  });

  // 4) Vincular SUPERADMIN con su rol (user_roles)
  await prisma.userRole.upsert({
    where: {
      userId_roleId: { userId: superadmin.id, roleId: superadminRole.id },
    },
    update: {},
    create: { userId: superadmin.id, roleId: superadminRole.id },
  });

  console.log('✅ Seed OK');
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
