import { PrismaClient, TipoPack, VerticalPack } from '@prisma/client';

/**
 * Seed del catálogo de packs (riel eje 2, Slice 1). Idempotente: upsert por
 * `clave`. Ningún pack concreto se construye en esta fase — solo entradas de
 * catálogo placeholder. Ver docs/disenos/packs-eje2.md §4.3.
 *
 * Packs de CAPACIDAD transversal (no generan asientos): Adjuntos y RAG, en
 * ambos verticales. Los packs de DOMINIO (Ventas/Compras/...) se seedean cuando
 * su sub-dominio se construya.
 */
const CATALOGO_PACKS: ReadonlyArray<{
  clave: string;
  nombre: string;
  descripcion: string;
  verticalAplicable: VerticalPack;
  tipo: TipoPack;
}> = [
  {
    clave: 'contabilidad.adjuntos',
    nombre: 'Adjuntos a comprobantes',
    descripcion: 'Guarda documentos de respaldo vinculados a un comprobante.',
    verticalAplicable: VerticalPack.CONTABILIDAD,
    tipo: TipoPack.CAPACIDAD,
  },
  {
    clave: 'contabilidad.rag',
    nombre: 'RAG + Agente inteligente',
    descripcion: 'Corpus curado de documentos vectorizados que un agente consulta y responde.',
    verticalAplicable: VerticalPack.CONTABILIDAD,
    tipo: TipoPack.CAPACIDAD,
  },
  {
    clave: 'granja.rag',
    nombre: 'RAG + Agente inteligente (Granja)',
    descripcion:
      'Corpus curado de documentos vectorizados del vertical Granja, consultable por un agente.',
    verticalAplicable: VerticalPack.GRANJA,
    tipo: TipoPack.CAPACIDAD,
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
      },
      create: pack,
    });
  }
}
