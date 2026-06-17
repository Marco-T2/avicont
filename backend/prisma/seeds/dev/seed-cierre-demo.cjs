// Seed dev-only (JS plano — ts-node no está instalado en este repo).
// Escenario de SMOKE del Cierre del Ejercicio Fiscal. Idempotente.
//
// Uso (desde backend/):
//   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/saas" \
//     node prisma/seeds/dev/seed-cierre-demo.cjs
//
// Espejo de prisma/seeds/dev/seed-cierre-demo.ts (la versión .ts queda como
// referencia legible; esta .cjs es la ejecutable sin ts-node).

const {
  ClaseCuenta,
  EstadoComprobante,
  GestionFiscalStatus,
  Moneda,
  NaturalezaCuenta,
  PeriodoFiscalStatus,
  PrismaClient,
  SubClaseCuenta,
  SystemRole,
  TipoComprobante,
} = require('@prisma/client');
const bcrypt = require('bcrypt');

const EMAIL = 'cierre@demo.bo';
const PASSWORD = 'password123';
const ORG_NAME = 'Cierre Demo 2025';
const ORG_SLUG = 'cierre-demo-2025';
const YEAR = 2025;

async function seedCierreDemo(prisma) {
  const hashedPassword = await bcrypt.hash(PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    create: { email: EMAIL, hashedPassword, displayName: 'Cierre demo', isEmailVerified: true },
    update: { hashedPassword, isActive: true },
  });

  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    create: { name: ORG_NAME, slug: ORG_SLUG, contabilidadEnabled: true, granjaEnabled: false },
    update: { contabilidadEnabled: true, granjaEnabled: false },
  });

  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    create: { organizationId: org.id, userId: user.id, systemRole: SystemRole.OWNER },
    update: { systemRole: SystemRole.OWNER, deactivatedAt: null },
  });

  // Reset idempotente del escenario contable de ESTA org.
  await prisma.lineaComprobante.deleteMany({ where: { organizationId: org.id } });
  await prisma.comprobante.deleteMany({ where: { organizationId: org.id } });
  await prisma.periodoFiscal.deleteMany({ where: { organizationId: org.id } });
  await prisma.gestionFiscal.deleteMany({ where: { organizationId: org.id } });
  await prisma.orgConfiguracionContable.deleteMany({ where: { organizationId: org.id } });
  await prisma.cuenta.deleteMany({ where: { organizationId: org.id } });

  const mk = (codigoInterno, nombre, claseCuenta, subClaseCuenta, naturaleza) =>
    prisma.cuenta.create({
      data: {
        organizationId: org.id,
        codigoInterno,
        nombre,
        claseCuenta,
        subClaseCuenta,
        naturaleza,
        nivel: 4,
        esDetalle: true,
      },
    });

  const [transitoria, acumulados, ventas, costo, sueldos, caja] = await Promise.all([
    mk('3.1.4.001', 'RESULTADO DE LA GESTIÓN', ClaseCuenta.PATRIMONIO, SubClaseCuenta.PATRIMONIO_RESULTADOS, NaturalezaCuenta.ACREEDORA),
    mk('3.1.3.001', 'RESULTADOS ACUMULADOS', ClaseCuenta.PATRIMONIO, SubClaseCuenta.PATRIMONIO_RESULTADOS, NaturalezaCuenta.ACREEDORA),
    mk('4.1.1.001', 'Ventas', ClaseCuenta.INGRESO, SubClaseCuenta.INGRESO_OPERATIVO, NaturalezaCuenta.ACREEDORA),
    mk('5.1.1.001', 'Costo de ventas', ClaseCuenta.EGRESO, SubClaseCuenta.EGRESO_OPERATIVO, NaturalezaCuenta.DEUDORA),
    mk('5.2.1.001', 'Sueldos', ClaseCuenta.EGRESO, SubClaseCuenta.EGRESO_ADMINISTRATIVO, NaturalezaCuenta.DEUDORA),
    mk('1.1.1.001', 'Caja', ClaseCuenta.ACTIVO, SubClaseCuenta.ACTIVO_CORRIENTE, NaturalezaCuenta.DEUDORA),
  ]);

  await prisma.orgConfiguracionContable.create({
    data: {
      organizationId: org.id,
      resultadoEjercicioId: transitoria.id,
      resultadosAcumuladosId: acumulados.id,
    },
  });

  const gestion = await prisma.gestionFiscal.create({
    data: { organizationId: org.id, year: YEAR, mesInicio: 1, status: GestionFiscalStatus.ABIERTA },
  });

  let periodo1Id = '';
  for (let mes = 1; mes <= 12; mes += 1) {
    const periodo = await prisma.periodoFiscal.create({
      data: {
        organizationId: org.id,
        gestionId: gestion.id,
        year: YEAR,
        month: mes,
        ordenEnGestion: mes,
        status: mes === 12 ? PeriodoFiscalStatus.ABIERTO : PeriodoFiscalStatus.CERRADO,
      },
    });
    if (mes === 1) periodo1Id = periodo.id;
  }

  const crearMovimiento = async (cuentaDebeId, cuentaHaberId, montoBob, glosa) => {
    const monto = montoBob.toFixed(2);
    await prisma.comprobante.create({
      data: {
        organizationId: org.id,
        tipo: TipoComprobante.DIARIO,
        estado: EstadoComprobante.CONTABILIZADO,
        fechaContable: new Date(Date.UTC(YEAR, 0, 15)),
        periodoFiscalId: periodo1Id,
        glosa,
        monedaPrincipal: Moneda.BOB,
        createdByUserId: user.id,
        numero: `D${String(YEAR).slice(2)}01-${Math.floor(Math.random() * 900000 + 100000)}`,
        totalDebitoBob: monto,
        totalCreditoBob: monto,
        lineas: {
          create: [
            { organizationId: org.id, orden: 1, cuentaId: cuentaDebeId, moneda: Moneda.BOB, debito: monto, credito: '0', tipoCambio: '1', debitoBob: monto, creditoBob: '0' },
            { organizationId: org.id, orden: 2, cuentaId: cuentaHaberId, moneda: Moneda.BOB, debito: '0', credito: monto, tipoCambio: '1', debitoBob: '0', creditoBob: monto },
          ],
        },
      },
    });
  };

  await crearMovimiento(caja.id, ventas.id, 100000, 'Venta de mercadería');
  await crearMovimiento(costo.id, caja.id, 60000, 'Costo de ventas');
  await crearMovimiento(sueldos.id, caja.id, 20000, 'Pago de sueldos');

  console.info('\n─────────────────────────────────────────');
  console.info('  Escenario de SMOKE del Cierre listo');
  console.info('─────────────────────────────────────────');
  console.info(`  Email:    ${EMAIL}`);
  console.info(`  Password: ${PASSWORD}`);
  console.info(`  Org:      ${ORG_NAME}`);
  console.info(`  Gestion:  ${YEAR} (id: ${gestion.id})`);
  console.info(`  Resultado esperado: utilidad +Bs 20.000,00`);
  console.info(`  Ruta UI:  /gestiones/cierre  ->  /gestiones/${gestion.id}/cierre`);
  console.info('─────────────────────────────────────────\n');
}

const prisma = new PrismaClient();
seedCierreDemo(prisma)
  .catch((err) => {
    console.error('Seed cierre-demo fallo:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
