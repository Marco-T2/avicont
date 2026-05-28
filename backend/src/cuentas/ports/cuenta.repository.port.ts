import type { ClaseCuenta, Moneda } from '@/common/domain/enums';

import type { Cuenta } from '../domain/cuenta';
import type { NaturalezaCuenta, SubClaseCuenta } from '../domain/enums';

export const CUENTA_REPOSITORY_PORT = Symbol('CUENTA_REPOSITORY_PORT');

// Filtros para listado paginado. Todos opcionales.
export interface ListarCuentasFiltros {
  claseCuenta?: ClaseCuenta;
  subClaseCuenta?: SubClaseCuenta;
  activa?: boolean;
  esDetalle?: boolean;
  search?: string; // busca en nombre o codigoInterno
  skip: number;
  take: number;
}

export interface ListarCuentasResultado {
  items: Cuenta[];
  total: number;
}

export interface CrearCuentaData {
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
  monedaFuncional: Moneda;
  permiteMultiMoneda: boolean;
  esSystemSeed: boolean;
  esRequeridaSistema: boolean;
}

export interface ActualizarCuentaData {
  nombre?: string;
  descripcion?: string | null;
  requiereContacto?: boolean;
  permiteMultiMoneda?: boolean;
  monedaFuncional?: Moneda;
}

export interface CuentaRepositoryPort {
  findById(id: string, tenantId: string): Promise<Cuenta | null>;
  findByCodigoInterno(tenantId: string, codigoInterno: string): Promise<Cuenta | null>;
  findParent(tenantId: string, parentId: string): Promise<Cuenta | null>;
  listar(tenantId: string, filtros: ListarCuentasFiltros): Promise<ListarCuentasResultado>;
  arbolCompleto(tenantId: string): Promise<Cuenta[]>;
  crear(data: CrearCuentaData): Promise<Cuenta>;
  actualizar(id: string, tenantId: string, data: ActualizarCuentaData): Promise<Cuenta>;
  desactivar(id: string, tenantId: string): Promise<Cuenta>;
  reactivar(id: string, tenantId: string): Promise<Cuenta>;

  // Lista los nombres de los campos de OrgConfiguracionContable que apuntan a esta cuenta.
  // Ej: ['ivaCreditoId', 'resultadoEjercicioId']. Vacío si no está configurada.
  conceptosQueUsanCuenta(tenantId: string, cuentaId: string): Promise<string[]>;
}
