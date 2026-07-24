import { PrismaClient } from '@prisma/client';

import type { PrismaService } from '@/common/prisma.service';

import { PrismaPackCatalogReader } from './prisma-pack-catalog.reader';

/**
 * Integration spec de PrismaPackCatalogReader contra Postgres real. Cubre
 * `listarOtorgadosPorDefecto` (auto-otorgamiento, design conciliacion-bancaria
 * §7.2): solo packs `otorgadoPorDefecto=true`, `activo=true` y del vertical
 * pedido — nunca cross-vertical, nunca los apagados del catálogo.
 */
describe('PrismaPackCatalogReader (integration)', () => {
  const CLAVE_DEFECTO_CONTA = 'packs-catalog-reader.defecto-conta';
  const CLAVE_NO_DEFECTO_CONTA = 'packs-catalog-reader.no-defecto-conta';
  const CLAVE_DEFECTO_GRANJA = 'packs-catalog-reader.defecto-granja';
  const CLAVE_DEFECTO_INACTIVO = 'packs-catalog-reader.defecto-inactivo';
  const CLAVES_TEST = [
    CLAVE_DEFECTO_CONTA,
    CLAVE_NO_DEFECTO_CONTA,
    CLAVE_DEFECTO_GRANJA,
    CLAVE_DEFECTO_INACTIVO,
  ];

  let prisma: PrismaClient;
  let reader: PrismaPackCatalogReader;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    reader = new PrismaPackCatalogReader(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await cleanup();
    await prisma.pack.createMany({
      data: [
        {
          clave: CLAVE_DEFECTO_CONTA,
          nombre: 'Otorgado por defecto (contabilidad)',
          verticalAplicable: 'CONTABILIDAD',
          tipo: 'DOMINIO',
          otorgadoPorDefecto: true,
          activo: true,
        },
        {
          clave: CLAVE_NO_DEFECTO_CONTA,
          nombre: 'NO otorgado por defecto (contabilidad)',
          verticalAplicable: 'CONTABILIDAD',
          tipo: 'CAPACIDAD',
          otorgadoPorDefecto: false,
          activo: true,
        },
        {
          clave: CLAVE_DEFECTO_GRANJA,
          nombre: 'Otorgado por defecto (granja)',
          verticalAplicable: 'GRANJA',
          tipo: 'DOMINIO',
          otorgadoPorDefecto: true,
          activo: true,
        },
        {
          clave: CLAVE_DEFECTO_INACTIVO,
          nombre: 'Otorgado por defecto pero retirado del catálogo',
          verticalAplicable: 'CONTABILIDAD',
          tipo: 'DOMINIO',
          otorgadoPorDefecto: true,
          activo: false,
        },
      ],
    });
  });

  async function cleanup() {
    await prisma.pack.deleteMany({ where: { clave: { in: CLAVES_TEST } } });
  }

  describe('listarOtorgadosPorDefecto', () => {
    it('devuelve solo los packs otorgadoPorDefecto=true y activo=true del vertical pedido', async () => {
      const packs = await reader.listarOtorgadosPorDefecto('CONTABILIDAD');
      const claves = packs.map((p) => p.clave);

      expect(claves).toContain(CLAVE_DEFECTO_CONTA);
      expect(claves).not.toContain(CLAVE_NO_DEFECTO_CONTA);
      expect(claves).not.toContain(CLAVE_DEFECTO_GRANJA);
      expect(claves).not.toContain(CLAVE_DEFECTO_INACTIVO);
    });

    it('vertical GRANJA devuelve solo el pack por defecto de granja', async () => {
      const packs = await reader.listarOtorgadosPorDefecto('GRANJA');
      const claves = packs.map((p) => p.clave);

      expect(claves).toContain(CLAVE_DEFECTO_GRANJA);
      expect(claves).not.toContain(CLAVE_DEFECTO_CONTA);
    });

    it('sin los packs de prueba otorgadoPorDefecto del vertical → ninguno de ellos aparece', async () => {
      await prisma.pack.deleteMany({ where: { clave: { in: CLAVES_TEST } } });

      // No se asume catálogo global vacío: este spec corre contra la BD de
      // desarrollo compartida (no un testcontainer aislado — §7.2), que puede
      // tener otros packs `otorgadoPorDefecto=true` reales (ej. el propio
      // `contabilidad.conciliacion` sembrado por prisma/seed.ts). Solo se
      // afirma que LOS PACKS DE ESTE TEST ya no aparecen.
      const packs = await reader.listarOtorgadosPorDefecto('CONTABILIDAD');
      const claves = packs.map((p) => p.clave);
      expect(claves).not.toContain(CLAVE_DEFECTO_CONTA);
      expect(claves).not.toContain(CLAVE_DEFECTO_INACTIVO);
    });
  });
});
