/**
 * Test de concurrencia para el invariante avesVivas >= 0.
 *
 * MOTIVACIÓN: dos `registrarCantidad` concurrentes sobre el mismo lote
 * NO deben dejar avesVivas negativo. El SELECT FOR UPDATE sobre el lote
 * serializa las transacciones y garantiza el invariante.
 *
 * LIMITACIÓN DEL TEST: Jest corre en Node.js single-threaded. `Promise.all`
 * con dos llamadas a $transaction en el mismo proceso crea concurrencia
 * en el event-loop de Node (non-blocking I/O), pero NO es verdadera
 * concurrencia de hilos de SO. Postgres SÍ puede recibir las dos TX
 * concurrentemente y el FOR UPDATE las serializa (una espera a la otra).
 *
 * Con el pool de conexiones default de PrismaClient (connection_limit=10),
 * las dos promesas se ejecutan en conexiones diferentes y Postgres
 * las procesa como TX verdaderamente concurrentes. El FOR UPDATE hace su trabajo.
 *
 * RESULTADO ESPERADO: una TX tiene éxito, la otra lanza
 * `MovimientoCantidadExcedeVivasError`; el total final de muertes = avesVivas
 * inicial (nunca sobrepasa cantidadInicial).
 *
 * Requiere Postgres con DATABASE_URL en el ambiente.
 */
import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { NaturalezaRegistro } from '../domain/enums';
import { MovimientoCantidadExcedeVivasError } from '../domain/granja-errors';
import { PrismaLoteRepository } from './prisma-lote.repository';
import { PrismaMovimientoRepository } from './prisma-movimiento.repository';
import { PrismaTipoRegistroRepository } from './prisma-tipo-registro.repository';
import { MovimientoService } from '../movimiento.service';
import type { LoteRepositoryPort } from '../ports/lote.repository.port';
import type { TipoRegistroRepositoryPort } from '../ports/tipo-registro.repository.port';
import type { MovimientoRepositoryPort } from '../ports/movimiento.repository.port';

describe('Invariante avesVivas >= 0 bajo concurrencia (integration)', () => {
  const SLUG = 'org-granja-concurrencia';

  let prisma: PrismaClient;
  let service: MovimientoService;
  let orgId: string;
  let loteId: string;
  let tipoCantidadId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const loteRepo = new PrismaLoteRepository(prisma as unknown as PrismaService);
    const tipoRepo = new PrismaTipoRegistroRepository(prisma as unknown as PrismaService);
    const movimientoRepo = new PrismaMovimientoRepository(prisma as unknown as PrismaService);

    service = new MovimientoService(
      loteRepo as unknown as LoteRepositoryPort,
      tipoRepo as unknown as TipoRegistroRepositoryPort,
      movimientoRepo as unknown as MovimientoRepositoryPort,
      prisma as unknown as PrismaService,
    );
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();

    const org = await prisma.organization.create({
      data: { slug: SLUG, name: 'Org Concurrencia' },
    });
    orgId = org.id;

    // Lote con cantidadInicial = 100 y avesVivas actuales = 10
    // (ya hay 90 muertes registradas)
    const lote = await prisma.lote.create({
      data: {
        organizationId: orgId,
        cantidadInicial: 100,
        fechaIngreso: new Date('2026-06-01'),
        estado: 'ACTIVO',
      },
    });
    loteId = lote.id;

    const tipo = await prisma.tipoRegistro.create({
      data: {
        organizationId: orgId,
        nombre: 'Mortalidad',
        naturaleza: NaturalezaRegistro.CANTIDAD,
        esSistema: true,
      },
    });
    tipoCantidadId = tipo.id;

    // Registrar 90 muertes para que avesVivas = 10
    await prisma.movimientoCantidad.create({
      data: {
        organizationId: orgId,
        loteId,
        tipoRegistroId: tipoCantidadId,
        cantidad: 90,
        fecha: new Date('2026-06-10'),
      },
    });
  });

  async function cleanup() {
    const orgs = await prisma.organization.findMany({
      where: { slug: SLUG },
      select: { id: true },
    });
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length > 0) {
      await prisma.movimientoCantidad.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.movimientoInversion.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await prisma.lote.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.tipoRegistro.deleteMany({ where: { organizationId: { in: orgIds } } });
    }
    await prisma.organization.deleteMany({ where: { slug: SLUG } });
  }

  it('dos TX concurrentes registrando 8 muertes: solo una tiene éxito, avesVivas nunca negativo', async () => {
    // GIVEN: lote con cantidadInicial=100, 90 muertes (avesVivas = 10)
    // WHEN: dos TX concurrentes intentan registrar cantidad = 8 cada una
    // THEN: a lo sumo una tiene éxito (8 <= 10); la otra lanza MovimientoCantidadExcedeVivasError
    //       o también tiene éxito si la suma 8+8=16 > 10 (ambas juntas excederían).
    //       El FOR UPDATE garantiza que la segunda TX lee el estado DESPUÉS del commit de la primera.

    const input = {
      tipoRegistroId: tipoCantidadId,
      cantidad: 8,
      fecha: new Date('2026-06-11'),
      detalle: null,
    };

    const results = await Promise.allSettled([
      service.registrarCantidad(orgId, loteId, input),
      service.registrarCantidad(orgId, loteId, { ...input }),
    ]);

    // Contar éxitos y rechazos
    const exitosos = results.filter((r) => r.status === 'fulfilled');
    const rechazados = results.filter((r) => r.status === 'rejected');

    // Verificar el estado final de la BD
    const totalMuertes = await prisma.movimientoCantidad.aggregate({
      where: { organizationId: orgId, loteId },
      _sum: { cantidad: true },
    });
    const muertesFinales = totalMuertes._sum.cantidad ?? 0;

    // Invariante crítico: totalMuertes <= cantidadInicial (100)
    expect(muertesFinales).toBeLessThanOrEqual(100);

    // Al menos una TX tuvo éxito (ambas podrían tener éxito si 8+8=16 <= 10 es false,
    // o exactamente una si la segunda leyó el total actualizado).
    // Lo importante: el estado final NUNCA es negativo.
    expect(muertesFinales).toBeGreaterThanOrEqual(90); // al menos las 90 originales

    if (rechazados.length > 0) {
      // Si alguna fue rechazada, debe ser con el error correcto
      const error = (rechazados[0] as PromiseRejectedResult).reason;
      expect(error).toBeInstanceOf(MovimientoCantidadExcedeVivasError);
    }

    // El resultado final: 90 (previas) + contribución de las TX concurrentes
    // Con FOR UPDATE: una TX gana, la otra ve muertes actualizadas
    // 90 + 8 = 98 (si una tiene éxito); 90 + 8 + 8 = 106 > 100 (imposible)
    // La segunda TX debe rechazarse porque 8 > (10 - 8) = 2 → excede
    expect(exitosos.length).toBeGreaterThanOrEqual(1);
    // Y el total nunca supera cantidadInicial
    expect(muertesFinales).toBeLessThanOrEqual(100);

    console.log(
      `[concurrencia] Éxitos: ${exitosos.length}, Rechazados: ${rechazados.length}, Muertes finales: ${muertesFinales}`,
    );
  }, 15000); // timeout generoso para TX concurrentes
});
