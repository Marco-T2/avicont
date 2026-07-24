import { PrismaClient, SystemRole, TipoPack, VerticalPack } from '@prisma/client';

/**
 * Seed del catálogo de packs (riel eje 2, Slice 1). Idempotente: upsert por
 * `clave`. Packs de CAPACIDAD transversal (Adjuntos, RAG) son placeholders sin
 * permisos propios aún. `contabilidad.conciliacion` es el primer pack de
 * DOMINIO con `otorgadoPorDefecto: true` (design conciliacion-bancaria §7.4).
 * Ver docs/disenos/packs-eje2.md §4.3.
 */
const CATALOGO_PACKS: ReadonlyArray<{
  clave: string;
  nombre: string;
  descripcion: string;
  verticalAplicable: VerticalPack;
  tipo: TipoPack;
  otorgadoPorDefecto: boolean;
}> = [
  {
    clave: 'contabilidad.adjuntos',
    nombre: 'Adjuntos a comprobantes',
    descripcion: 'Guarda documentos de respaldo vinculados a un comprobante.',
    verticalAplicable: VerticalPack.CONTABILIDAD,
    tipo: TipoPack.CAPACIDAD,
    otorgadoPorDefecto: false,
  },
  {
    clave: 'contabilidad.rag',
    nombre: 'RAG + Agente inteligente',
    descripcion: 'Corpus curado de documentos vectorizados que un agente consulta y responde.',
    verticalAplicable: VerticalPack.CONTABILIDAD,
    tipo: TipoPack.CAPACIDAD,
    otorgadoPorDefecto: false,
  },
  {
    clave: 'granja.rag',
    nombre: 'RAG + Agente inteligente (Granja)',
    descripcion:
      'Corpus curado de documentos vectorizados del vertical Granja, consultable por un agente.',
    verticalAplicable: VerticalPack.GRANJA,
    tipo: TipoPack.CAPACIDAD,
    otorgadoPorDefecto: false,
  },
  {
    clave: 'contabilidad.conciliacion',
    nombre: 'Conciliación bancaria',
    descripcion:
      'Importa extractos bancarios y concilia movimientos contra los comprobantes registrados.',
    verticalAplicable: VerticalPack.CONTABILIDAD,
    tipo: TipoPack.DOMINIO,
    otorgadoPorDefecto: true,
  },
];

export async function seedPacksCatalogo(prisma: PrismaClient): Promise<void> {
  for (const pack of CATALOGO_PACKS) {
    await prisma.pack.upsert({
      where: { clave: pack.clave },
      update: {
        nombre: pack.nombre,
        descripcion: pack.descripcion,
        verticalAplicable: pack.verticalAplicable,
        tipo: pack.tipo,
        otorgadoPorDefecto: pack.otorgadoPorDefecto,
      },
      create: pack,
    });
  }
}

/**
 * Backfill de orgs EXISTENTES (creadas antes de que `contabilidad.conciliacion`
 * entrara al catálogo): otorga el entitlement `activo=true` a toda org con
 * `contabilidadEnabled=true` que todavía no lo tenga. El actor (`habilitadoPorUserId`)
 * sale de la membership `systemRole=OWNER` de la org — `Organization` NO tiene
 * `ownerUserId` (design §0 C-3, §7.4). `upsert` idempotente: si la org (o un
 * super-admin) ya decidió `activo=false` para este pack, NO lo pisa —
 * `update: {}` deja la fila intacta.
 *
 * Va en el SEED, no en la migración: la fila del pack recién existe después de
 * `seedPacksCatalogo`, y en `migrate deploy` todavía no existe (§7.4 diseño).
 */
export async function backfillOtorgamientoPorDefecto(prisma: PrismaClient): Promise<void> {
  const packsPorDefecto = await prisma.pack.findMany({
    where: { otorgadoPorDefecto: true },
  });

  for (const pack of packsPorDefecto) {
    const orgs = await prisma.organization.findMany({
      where:
        pack.verticalAplicable === VerticalPack.CONTABILIDAD
          ? { contabilidadEnabled: true }
          : { granjaEnabled: true },
      select: { id: true },
    });

    for (const org of orgs) {
      const ownerMembership = await prisma.membership.findFirst({
        where: { organizationId: org.id, systemRole: SystemRole.OWNER },
        select: { userId: true },
      });
      // Org sin OWNER (estado inconsistente/de prueba): sin actor, se salta.
      if (ownerMembership === null) continue;

      await prisma.orgPackEntitlement.upsert({
        where: { organizationId_packId: { organizationId: org.id, packId: pack.id } },
        update: {},
        create: {
          organizationId: org.id,
          packId: pack.id,
          activo: true,
          habilitadoPorUserId: ownerMembership.userId,
        },
      });
    }
  }
}
