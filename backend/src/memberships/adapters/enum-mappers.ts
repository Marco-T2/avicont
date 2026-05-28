// Mappers de enums dominio ↔ Prisma para el módulo memberships.
// Convención §5.3 de `docs/deudas-arquitecturales.md`.
//
// Solo el VO de dominio `MembershipRole` usa el enum del dominio; el service
// mapea Prisma→dominio al parsear el DTO y dominio→Prisma al persistir vía el
// repositorio (que opera sobre rows Prisma, divergencia §5). Los valores string
// son idénticos; el `Record` separa los nominal types.

import { SystemRole as PrismaSystemRole } from '@prisma/client';

import { SystemRole } from '@/common/domain/enums';

const PRISMA_A_DOMINIO: Record<PrismaSystemRole, SystemRole> = {
  OWNER: SystemRole.OWNER,
  ADMIN: SystemRole.ADMIN,
};

const DOMINIO_A_PRISMA: Record<SystemRole, PrismaSystemRole> = {
  [SystemRole.OWNER]: PrismaSystemRole.OWNER,
  [SystemRole.ADMIN]: PrismaSystemRole.ADMIN,
};

export function toDominioSystemRole(p: PrismaSystemRole): SystemRole {
  return PRISMA_A_DOMINIO[p];
}

export function toPrismaSystemRole(d: SystemRole): PrismaSystemRole {
  return DOMINIO_A_PRISMA[d];
}
