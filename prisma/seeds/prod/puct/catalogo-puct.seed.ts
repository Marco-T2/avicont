import { PrismaClient } from '@prisma/client';
import { parsearPuct } from './parser';

// Seed idempotente del Catálogo PUCT (RND No 101800000004).
// Lee el xlsx oficial commiteado en source/ y upsertea cada registro.
// Seguro de re-correr — los registros existentes se actualizan, no se duplican.
//
// Ejecutar:
//   npm run seed:puct
// o desde el seed principal:
//   await sembrarCatalogoPuct(prisma);

export async function sembrarCatalogoPuct(prisma: PrismaClient): Promise<{
  totalParseados: number;
  insertados: number;
  actualizados: number;
}> {
  const records = parsearPuct();

  // Conteo previo para reportar deltas.
  const existentes = await prisma.catalogoPuct.findMany({ select: { codigo: true } });
  const existentesSet = new Set(existentes.map((c) => c.codigo));

  // Upsert en orden de nivel para que los padres existan antes que los hijos
  // (no es estrictamente necesario porque el FK es nullable y self-referential,
  // pero ayuda a queries inmediatas que asuman jerarquía completa).
  records.sort((a, b) => a.nivel - b.nivel);

  let insertados = 0;
  let actualizados = 0;

  for (const r of records) {
    const existia = existentesSet.has(r.codigo);
    await prisma.catalogoPuct.upsert({
      where: { codigo: r.codigo },
      create: {
        codigo: r.codigo,
        nivel: r.nivel,
        nombre: r.nombre,
        claseCuenta: r.claseCuenta,
        ...(r.padre !== null ? { padre: r.padre } : {}),
        tiposEmpresa: r.tiposEmpresa,
        versionPuct: r.versionPuct,
      },
      update: {
        nivel: r.nivel,
        nombre: r.nombre,
        claseCuenta: r.claseCuenta,
        ...(r.padre !== null ? { padre: r.padre } : { padre: null }),
        tiposEmpresa: r.tiposEmpresa,
        versionPuct: r.versionPuct,
        // activo NO se toca en upsert: si un admin lo desactivó manualmente
        // por algún motivo operativo, el seed no debe revertirlo.
      },
    });
    if (existia) actualizados++;
    else insertados++;
  }

  return { totalParseados: records.length, insertados, actualizados };
}

// Permite ejecutar el seed standalone con `npx ts-node prisma/seeds/prod/puct/catalogo-puct.seed.ts`.
if (require.main === module) {
  const prisma = new PrismaClient();
  sembrarCatalogoPuct(prisma)
    .then((stats) => {
      console.info('CatalogoPuct seed completo:', stats);
    })
    .catch((err) => {
      console.error('Seed falló:', err);
      process.exit(1);
    })
    .finally(() => {
      void prisma.$disconnect();
    });
}
