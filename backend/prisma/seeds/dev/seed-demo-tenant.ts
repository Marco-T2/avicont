// Seed dev-only: deja el entorno local listo para probar el frontend.
// Idempotente — se puede correr múltiples veces sin duplicar datos.
//
// Uso:
//   DATABASE_URL="..." npx ts-node backend/prisma/seeds/dev/seed-demo-tenant.ts
//   (desde la raíz del monorepo; o desde backend/ con path relativo)
//
// Crea:
//   - User demo: cookie-test@e2e.bo / pass12345 (OWNER de la org demo)
//   - Organization "Demo Avicont" (slug único, activa)
//   - Membership OWNER del user en la org
//   - Plan de cuentas COMERCIAL completo (111 cuentas)
//   - OrgConfiguracionContable auto-populada (8 conceptos mapeados)
//
// TODO(fase-1.1+): cuando los modelos existan, sumar al seed:
//   - Contactos (1 cliente + 1 proveedor con NITs válidos)
//   - TipoCambio oficial del BCB últimos 30 días
//   - CotizacionUfv del día y semana previa
// Esos modelos todavía no están en schema.prisma — no es scope creep,
// es que no hay dónde escribirlos.

import { PrismaClient, SystemRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import {
  poblarConfiguracionContableRequerida,
  sembrarPlanCuentasComercial,
} from '../prod/planes-cuentas/comercial';

const DEMO_EMAIL = 'cookie-test@e2e.bo';
const DEMO_PASSWORD = 'pass12345';
const DEMO_ORG_NAME = 'Demo Avicont';
const DEMO_ORG_SLUG = 'demo-avicont';

async function seedDemoTenant(prisma: PrismaClient): Promise<void> {
  // ---- User ----
  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: {
      email: DEMO_EMAIL,
      hashedPassword,
      displayName: 'Demo user',
      isEmailVerified: true,
    },
    update: {
      // Reintenta el hash por si en el .env cambiaron el salt rounds.
      hashedPassword,
      isActive: true,
    },
  });
  console.info(`✔ User: ${user.email} (id: ${user.id})`);

  // ---- Organization ----
  const org = await prisma.organization.upsert({
    where: { slug: DEMO_ORG_SLUG },
    create: { name: DEMO_ORG_NAME, slug: DEMO_ORG_SLUG },
    update: { name: DEMO_ORG_NAME },
  });
  console.info(`✔ Organization: ${org.name} (id: ${org.id})`);

  // ---- Membership OWNER ----
  const membership = await prisma.membership.upsert({
    where: {
      organizationId_userId: { organizationId: org.id, userId: user.id },
    },
    create: {
      organizationId: org.id,
      userId: user.id,
      systemRole: SystemRole.OWNER,
    },
    update: {
      systemRole: SystemRole.OWNER,
      deactivatedAt: null,
    },
  });
  console.info(`✔ Membership: ${membership.systemRole ?? membership.customRoleId}`);

  // ---- Plan de cuentas + configuración contable ----
  const stats = await sembrarPlanCuentasComercial(prisma, org.id);
  console.info(
    `✔ Plan de cuentas COMERCIAL: ${stats.totalCuentas} cuentas`,
    stats.porNivel,
  );

  const config = await poblarConfiguracionContableRequerida(
    prisma,
    org.id,
    stats.porCodigoPuct,
  );
  const mapeados = [
    config.ivaCreditoId,
    config.ivaDebitoId,
    config.rcIvaRetenidoId,
    config.itPorPagarId,
    config.resultadosAcumuladosId,
    config.resultadoEjercicioId,
    config.difCambioGananciaId,
    config.difCambioPerdidaId,
  ].filter((v) => v !== null).length;
  console.info(`✔ Configuración contable: ${mapeados}/8 conceptos mapeados`);

  // ---- Resumen ----
  console.info('\n─────────────────────────────────────────');
  console.info('  Entorno demo listo para el frontend');
  console.info('─────────────────────────────────────────');
  console.info(`  Email:    ${DEMO_EMAIL}`);
  console.info(`  Password: ${DEMO_PASSWORD}`);
  console.info(`  Org:      ${DEMO_ORG_NAME} (${org.id})`);
  console.info('─────────────────────────────────────────\n');
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedDemoTenant(prisma)
    .catch((err) => {
      console.error('Seed demo falló:', err);
      process.exit(1);
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}

export { seedDemoTenant };
