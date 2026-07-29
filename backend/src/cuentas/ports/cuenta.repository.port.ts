import type {
  ActividadFlujo,
  ClaseCuenta,
  Moneda,
  NaturalezaCuenta,
  SubClaseCuenta,
} from '@/common/domain/enums';

import type { Cuenta } from '../domain/cuenta';

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
  actividadFlujo?: ActividadFlujo | null;
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

  /**
   * Ítems ACTIVOS que declaran esta cuenta como `cuentaIngresoId`. Sostiene el
   * guard `CUENTA_REFERENCIADA_POR_ITEMS` (REQ-ITM-05, Anti-41): el admin no
   * desactiva una cuenta sin saber que hay ítems enchufados a ella.
   *
   * Devuelve los ítems, no un conteo: `details` tiene que decir CUÁLES para
   * que el usuario sepa qué ir a re-mapear.
   *
   * Lee la tabla de otro módulo, igual que `contactos.countLineasReferenciadoras`
   * lee `lineas_comprobante`: responder "¿quién me referencia?" es propio del
   * dueño del recurso que se está protegiendo.
   */
  itemsActivosQueUsanCuenta(
    tenantId: string,
    cuentaId: string,
  ): Promise<{ id: string; nombre: string; codigo: string | null }[]>;
}
