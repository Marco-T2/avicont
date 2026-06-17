// Port DEFINIDO y POSEÍDO por `cierre-ejercicio` (§3.7 CLAUDE.md). Resuelve la
// configuración contable que el cierre necesita: las dos cuentas destino
// (transitoria `resultadoEjercicioId` = 3.1.4.001 RESULTADO DE LA GESTIÓN y
// `resultadosAcumuladosId` = 3.1.3.001) y el `tipoEmpresaPrincipal` de la org
// (para derivar el mesCierre vía `calcularMesCierre`, Ley 843 art. 46).
//
// El adapter lee su propia superficie Prisma (OrgConfiguracionContable +
// Organization), mismo patrón que los adapters de `reportes` (§3.7): cada
// módulo define su read-surface sin importar el repo de otro módulo.

import type { TipoEmpresa } from '@/common/domain/enums';

export const CIERRE_CONFIG_READER_PORT = Symbol('CIERRE_CONFIG_READER_PORT');

export interface CierreConfig {
  /** Transitoria 3.1.4.001 RESULTADO DE LA GESTIÓN (`resultadoEjercicioId`). */
  resultadoEjercicioId: string;
  /** Destino final 3.1.3.001 RESULTADOS ACUMULADOS (`resultadosAcumuladosId`). */
  resultadosAcumuladosId: string;
  /** Para `calcularMesCierre` (12/3/6/9 — Ley 843 art. 46). */
  tipoEmpresaPrincipal: TipoEmpresa;
}

export abstract class CierreConfigReaderPort {
  /**
   * Devuelve la config de cierre del tenant. Lanza
   * `CierreConfigCuentaFaltanteError` (422) si `resultadoEjercicioId` o
   * `resultadosAcumuladosId` no están configurados (null/undefined).
   * organizationId SIEMPRE primer predicado (§4.2 Anti-31).
   */
  abstract obtenerConfig(tenantId: string): Promise<CierreConfig>;
}
