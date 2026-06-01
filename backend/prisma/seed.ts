import { PrismaClient, SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Permisos de los templates que se precargan al crear una Organization.
// Ver CLAUDE.md §10.4 (roles templates) y §2.5 (convención de strings).
// Formato: {modulo}.{recurso}.{accion}.

const CONTADOR_PERMISSIONS = [
  'contabilidad.dashboard.read',
  'contabilidad.plan-cuentas.read',
  'contabilidad.plan-cuentas.create',
  'contabilidad.plan-cuentas.update',
  'contabilidad.plan-cuentas.delete',
  'contabilidad.asientos.read',
  'contabilidad.asientos.create',
  'contabilidad.asientos.update',
  'contabilidad.asientos.delete',
  'contabilidad.asientos.post',
  'contabilidad.asientos.void',
  // Editar un comprobante CONTABILIZADO mientras el período esté abierto.
  // Verificado desde el servicio (no el guard) — ver ComprobantesService.editarContabilizado.
  // Asignado por defecto a Contador (puede retirarse al crear roles personalizados).
  'contabilidad.asientos.edit-posted',
  'contabilidad.contactos.read',
  'contabilidad.contactos.create',
  'contabilidad.contactos.update',
  'contabilidad.contactos.delete',
  'contabilidad.libro-diario.read',
  'contabilidad.libro-mayor.read',
  'contabilidad.ventas.read',
  'contabilidad.ventas.create',
  'contabilidad.ventas.update',
  'contabilidad.ventas.delete',
  'contabilidad.compras.read',
  'contabilidad.compras.create',
  'contabilidad.compras.update',
  'contabilidad.compras.delete',
  'contabilidad.periodos.read',
  'contabilidad.periodos.create',
  'contabilidad.cierre-mensual.read',
  'contabilidad.cierre-mensual.create',
  'contabilidad.eeff.read',
  'contabilidad.configuracion.read',
  'contabilidad.configuracion.update',
];

const GRANJERO_PERMISSIONS = [
  'granja.dashboard.read',
  'granja.lotes.read',
  'granja.lotes.create',
  'granja.lotes.update',
  'granja.lotes.delete',
  'granja.tipos-registro.read',
  'granja.tipos-registro.create',
  'granja.tipos-registro.update',
  'granja.tipos-registro.delete',
  'granja.movimientos.read',
  'granja.movimientos.create',
  'granja.movimientos.update',
  'granja.movimientos.delete',
  'granja.chat.interact',
];

async function main() {
  const password = await bcrypt.hash('password', 10);

  const founder = await prisma.user.upsert({
    where: { email: 'founder@avicont.bo' },
    update: {},
    create: {
      email: 'founder@avicont.bo',
      hashedPassword: password,
      displayName: 'Founder',
      isEmailVerified: true,
      isActive: true,
    },
  });

  const asociacion = await prisma.organization.upsert({
    where: { slug: 'asociacion-piloto' },
    update: {},
    create: {
      slug: 'asociacion-piloto',
      name: 'Asociación Piloto',
      contabilidadEnabled: true,
      granjaEnabled: false,
    },
  });

  // Templates precargados (editables) para cada organización nueva.
  await prisma.customRole.upsert({
    where: { organizationId_slug: { organizationId: asociacion.id, slug: 'contador' } },
    update: {},
    create: {
      organizationId: asociacion.id,
      slug: 'contador',
      name: 'Contador',
      description: 'Acceso completo al módulo de contabilidad',
      permissions: CONTADOR_PERMISSIONS,
      isSystemDefault: true,
      isEditable: true,
      createdById: founder.id,
    },
  });

  await prisma.customRole.upsert({
    where: { organizationId_slug: { organizationId: asociacion.id, slug: 'granjero' } },
    update: {},
    create: {
      organizationId: asociacion.id,
      slug: 'granjero',
      name: 'Granjero',
      description: 'Acceso completo al módulo de granja',
      permissions: GRANJERO_PERMISSIONS,
      isSystemDefault: true,
      isEditable: true,
      createdById: founder.id,
    },
  });

  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: asociacion.id, userId: founder.id } },
    update: { systemRole: SystemRole.OWNER, customRoleId: null },
    create: {
      organizationId: asociacion.id,
      userId: founder.id,
      systemRole: SystemRole.OWNER,
    },
  });

  console.info('Seed complete:', {
    user: founder.email,
    organization: asociacion.slug,
    templates: ['contador', 'granjero'],
  });

  // Bootstrap del primer super-admin de plataforma (huevo-gallina, REQ-SA-10).
  // Gateado por env: si SUPER_ADMIN_EMAIL apunta a un user existente, lo marca.
  // Idempotente: segunda corrida deja UN solo super-admin (update no-op, sin audit duplicado).
  // Si el email no existe en BD → lanza error descriptivo (no silencioso).
  // Si la env no está definida → skip sin error (seed corre normalmente).
  // design.md Decisión 8.
  const superAdminEmail = process.env['SUPER_ADMIN_EMAIL'];
  if (superAdminEmail) {
    const { grantSuperAdmin } = await import('../src/auth/super-admin-bootstrap');
    await grantSuperAdmin(prisma, superAdminEmail, 'seed');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
