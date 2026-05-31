/**
 * Construcción del árbol del Estado de Resultados.
 *
 * Función pura exportada — cero @Injectable(), cero imports de NestJS/Prisma.
 * Testeable en aislamiento total. Cobertura objetivo ≥ 95% (§7.5 CLAUDE.md).
 *
 * Algoritmo (diseño D-02 — variante de flujo, no generalizar con balance-arbol.ts):
 *   1. Para cada cuenta hoja: cruzar cuentaId con saldosRango; aplicar calcularSaldoNeto.
 *      Sin fila en saldosRango → Money.ZERO (cuentas de resultado parten de 0 — REQ-ER-02).
 *   2. Indexar por id y parentId; propagar hojas → agrupadores por nivel descendente.
 *   3. esContraria=true RESTA en la propagación (idéntico al Balance).
 *   4. Ensamblar DOS secciones: INGRESO y EGRESO por subClaseCuenta.
 *      ACTIVO/PASIVO/PATRIMONIO se IGNORAN.
 *   5. ResultadoEjercicio = Σ INGRESO − Σ EGRESO (escalar, no línea sintética).
 *   6. Omitir hojas con saldo 0; omitir agrupadores sin descendientes con saldo ≠ 0.
 *
 * // NCB / NIC 1: Estado de Resultados de flujo del período, sin arrastre histórico.
 * // Código Tributario art. 47: ResultadoEjercicio = Σ Ingresos − Σ Egresos del período.
 */

import { ClaseCuenta } from '@prisma/client';

import { Money } from '@/common/domain/money';

import type {
  CuentaResultadosCalculada,
  EstadoResultadosArbolResult,
  SeccionResultadosCalculada,
  SubseccionResultadosCalculada,
} from '../dto/eeff-resultados-response.dto';
import type { CuentaEstructuraRow, SaldoCuentaRow } from '../ports/eeff-saldos-reader.port';
import { calcularSaldoNeto } from './saldo-naturaleza';

// ============================================================
// Tipos internos
// ============================================================

interface NodoArbol {
  cuenta: CuentaEstructuraRow;
  saldoNeto: Money;
  tieneContenido: boolean;
}

// ============================================================
// Parámetros de entrada
// ============================================================

export interface ConstruirEstadoResultadosParams {
  estructura: CuentaEstructuraRow[];
  saldosRango: SaldoCuentaRow[];
}

// ============================================================
// Función principal
// ============================================================

/**
 * Construye el árbol del Estado de Resultados a partir de la estructura de cuentas
 * y los saldos de flujo del rango [desde, hasta] calculados por el adapter.
 *
 * // NCB / NIC 1: Estado de Resultados de flujo del período, sin arrastre histórico.
 * // Código Tributario art. 47: ResultadoEjercicio = Σ Ingresos − Σ Egresos del período.
 */
export function construirEstadoResultados(
  params: ConstruirEstadoResultadosParams,
): EstadoResultadosArbolResult {
  const { estructura, saldosRango } = params;

  // Solo cuentas INGRESO y EGRESO — ACTIVO/PASIVO/PATRIMONIO se ignoran
  const cuentasResultado = estructura.filter(
    (c) => c.claseCuenta === ClaseCuenta.INGRESO || c.claseCuenta === ClaseCuenta.EGRESO,
  );

  if (cuentasResultado.length === 0) {
    return {
      ingreso: {
        claseCuenta: ClaseCuenta.INGRESO,
        titulo: 'Ingresos',
        subsecciones: [],
        totalBob: Money.ZERO,
      },
      egreso: {
        claseCuenta: ClaseCuenta.EGRESO,
        titulo: 'Egresos',
        subsecciones: [],
        totalBob: Money.ZERO,
      },
      resultadoEjercicioBob: Money.ZERO,
    };
  }

  // Índice de saldos por cuentaId
  const saldosMap = new Map<string, SaldoCuentaRow>(saldosRango.map((s) => [s.cuentaId, s]));

  // Índice de hijos por parentId (solo dentro de cuentas de resultado)
  const idsResultado = new Set(cuentasResultado.map((c) => c.id));
  const hijosPorParentId = new Map<string, string[]>();
  for (const cuenta of cuentasResultado) {
    if (cuenta.parentId !== null && idsResultado.has(cuenta.parentId)) {
      const lista = hijosPorParentId.get(cuenta.parentId);
      if (lista) {
        lista.push(cuenta.id);
      } else {
        hijosPorParentId.set(cuenta.parentId, [cuenta.id]);
      }
    }
  }

  // Nivel máximo dentro de cuentas de resultado
  const nivelMax = cuentasResultado.reduce((max, c) => Math.max(max, c.nivel), 0);

  // Inicializar nodos: hojas tienen saldo propio (flujo del período — parte de 0 si no hay movimiento)
  const nodos = new Map<string, NodoArbol>();
  for (const cuenta of cuentasResultado) {
    if (cuenta.esDetalle) {
      // NCB / NIC 1: sin fila → Money.ZERO (flujo parte de 0 al inicio del rango — REQ-ER-02).
      const saldoRow = saldosMap.get(cuenta.id);
      const saldoNeto = saldoRow
        ? calcularSaldoNeto(saldoRow.totalDebitoBob, saldoRow.totalCreditoBob, cuenta.naturaleza)
        : Money.ZERO;

      nodos.set(cuenta.id, { cuenta, saldoNeto, tieneContenido: !saldoNeto.isZero() });
    } else {
      nodos.set(cuenta.id, { cuenta, saldoNeto: Money.ZERO, tieneContenido: false });
    }
  }

  // Propagación de hojas a agrupadores — de nivel más profundo al más alto
  for (let nivel = nivelMax; nivel >= 1; nivel--) {
    const agrupadores = cuentasResultado.filter((c) => c.nivel === nivel && !c.esDetalle);

    for (const agrupador of agrupadores) {
      const hijos = hijosPorParentId.get(agrupador.id) ?? [];
      let saldoAgrupado = Money.ZERO;
      let tieneContenido = false;

      for (const hijoId of hijos) {
        const hijoNodo = nodos.get(hijoId);
        if (!hijoNodo) continue;

        if (hijoNodo.tieneContenido || !hijoNodo.saldoNeto.isZero()) tieneContenido = true;

        // NCB + Código Tributario art. 47: cuentas contrarias RESTAN del grupo.
        // Ej: Devoluciones sobre Ventas (esContraria=true) restan del Ingreso Operativo.
        if (hijoNodo.cuenta.esContraria) {
          saldoAgrupado = saldoAgrupado.minus(hijoNodo.saldoNeto);
        } else {
          saldoAgrupado = saldoAgrupado.plus(hijoNodo.saldoNeto);
        }
      }

      nodos.set(agrupador.id, { cuenta: agrupador, saldoNeto: saldoAgrupado, tieneContenido });
    }
  }

  // Ensamblar secciones INGRESO y EGRESO
  const ingreso = ensamblarSeccionResultados(
    ClaseCuenta.INGRESO,
    'Ingresos',
    cuentasResultado,
    nodos,
    hijosPorParentId,
  );
  const egreso = ensamblarSeccionResultados(
    ClaseCuenta.EGRESO,
    'Egresos',
    cuentasResultado,
    nodos,
    hijosPorParentId,
  );

  // Código Tributario art. 47: ResultadoEjercicio = Σ Ingresos − Σ Egresos del período.
  const resultadoEjercicioBob = ingreso.totalBob.minus(egreso.totalBob);

  return { ingreso, egreso, resultadoEjercicioBob };
}

// ============================================================
// Ensamblado de sección
// ============================================================

function ensamblarSeccionResultados(
  claseCuenta: ClaseCuenta,
  titulo: string,
  estructura: CuentaEstructuraRow[],
  nodos: Map<string, NodoArbol>,
  hijosPorParentId: Map<string, string[]>,
): SeccionResultadosCalculada {
  const cuentasDeClase = estructura.filter(
    (c) => c.claseCuenta === claseCuenta && c.subClaseCuenta !== null,
  );

  // Obtener subclases únicas presentes
  const subClasesVistas = new Set<string>();
  const subClasesOrdenadas: NonNullable<CuentaEstructuraRow['subClaseCuenta']>[] = [];
  for (const c of cuentasDeClase) {
    if (c.subClaseCuenta && !subClasesVistas.has(c.subClaseCuenta)) {
      subClasesVistas.add(c.subClaseCuenta);
      subClasesOrdenadas.push(c.subClaseCuenta);
    }
  }

  const subsecciones: SubseccionResultadosCalculada[] = [];
  let totalSeccion = Money.ZERO;

  for (const subClase of subClasesOrdenadas) {
    const cuentasDeSubClase = cuentasDeClase.filter((c) => c.subClaseCuenta === subClase);

    // Cuentas raíz de la subclase (sin parent dentro de la misma subclase)
    const idsEnSubClase = new Set(cuentasDeSubClase.map((c) => c.id));
    const cuentasRaizDeSubClase = cuentasDeSubClase.filter(
      (c) => c.parentId === null || !idsEnSubClase.has(c.parentId),
    );

    let totalSubClase = Money.ZERO;
    let tieneContenido = false;

    for (const raiz of cuentasRaizDeSubClase) {
      const nodo = nodos.get(raiz.id);
      if (!nodo) continue;
      if (nodo.saldoNeto.isZero() && !nodo.tieneContenido) continue;

      tieneContenido = true;
      // NCB + Código Tributario art. 47: cuentas contrarias RESTAN del total de la subsección.
      if (raiz.esContraria) {
        totalSubClase = totalSubClase.minus(nodo.saldoNeto);
      } else {
        totalSubClase = totalSubClase.plus(nodo.saldoNeto);
      }
    }

    if (!tieneContenido) continue;

    const cuentasParaDto = recolectarCuentasResultados(
      cuentasRaizDeSubClase,
      nodos,
      hijosPorParentId,
    );
    if (cuentasParaDto.length === 0) continue;

    subsecciones.push({
      subClaseCuenta: subClase,
      titulo: subClase,
      cuentas: cuentasParaDto,
      totalBob: totalSubClase,
    });

    totalSeccion = totalSeccion.plus(totalSubClase);
  }

  return { claseCuenta, titulo, subsecciones, totalBob: totalSeccion };
}

// ============================================================
// Recolección de cuentas para DTO (aplana árbol)
// ============================================================

function recolectarCuentasResultados(
  cuentasRaiz: CuentaEstructuraRow[],
  nodos: Map<string, NodoArbol>,
  hijosPorParentId: Map<string, string[]>,
): CuentaResultadosCalculada[] {
  const resultado: CuentaResultadosCalculada[] = [];

  function recorrer(cuentaId: string) {
    const nodo = nodos.get(cuentaId);
    if (!nodo) return;
    if (!nodo.tieneContenido && nodo.saldoNeto.isZero()) return;

    resultado.push({
      cuentaId: nodo.cuenta.id,
      codigoInterno: nodo.cuenta.codigoInterno,
      nombre: nodo.cuenta.nombre,
      nivel: nodo.cuenta.nivel,
      esContraria: nodo.cuenta.esContraria,
      saldoBob: nodo.saldoNeto,
    });

    // Recorrer hijos ordenados por codigoInterno ASC (REQ-ER-09)
    const hijoIds = hijosPorParentId.get(cuentaId) ?? [];
    const hijosOrdenados = hijoIds
      .map((id) => nodos.get(id))
      .filter((n): n is NodoArbol => n !== undefined)
      .sort((a, b) => a.cuenta.codigoInterno.localeCompare(b.cuenta.codigoInterno));

    for (const hijo of hijosOrdenados) {
      recorrer(hijo.cuenta.id);
    }
  }

  // Ordenar raíces por codigoInterno ASC (REQ-ER-09)
  const raicesOrdenadas = [...cuentasRaiz].sort((a, b) =>
    a.codigoInterno.localeCompare(b.codigoInterno),
  );

  for (const raiz of raicesOrdenadas) {
    recorrer(raiz.id);
  }

  return resultado;
}
