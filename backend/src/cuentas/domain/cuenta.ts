// Entidad de dominio Cuenta: espejo del row Prisma con los enums propios del
// dominio. Vive acá porque el dominio NO importa runtime de `@prisma/client`
// (§3.5 CLAUDE.md, política §5.3 de `docs/deudas-arquitecturales.md`).
//
// El adapter `prisma-cuenta.repository.ts` mapea row Prisma ↔ `Cuenta` dominio
// usando los enum mappers de `../adapters/enum-mappers.ts`.
//
import type {
  ActividadFlujo,
  ClaseCuenta,
  Moneda,
  NaturalezaCuenta,
  SubClaseCuenta,
} from '@/common/domain/enums';

export interface Cuenta {
  id: string;
  organizationId: string;
  codigoInterno: string;
  nombre: string;
  descripcion: string | null;
  claseCuenta: ClaseCuenta;
  subClaseCuenta: SubClaseCuenta | null;
  naturaleza: NaturalezaCuenta;
  parentId: string | null;
  nivel: number;
  esDetalle: boolean;
  requiereContacto: boolean;
  esContraria: boolean;
  activa: boolean;
  monedaFuncional: Moneda;
  permiteMultiMoneda: boolean;
  esSystemSeed: boolean;
  esRequeridaSistema: boolean;
  actividadFlujo: ActividadFlujo | null;
  createdAt: Date;
  updatedAt: Date;
}
