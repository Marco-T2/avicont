/**
 * Construcción del árbol del Balance General.
 *
 * Función pura exportada — cero @Injectable(), cero imports de NestJS/Prisma.
 * Testeable en aislamiento total. Cobertura objetivo ≥ 95% (§7.5 CLAUDE.md).
 *
 * Algoritmo:
 *   1. Para cada cuenta hoja: cruzar con saldosHasta; aplicar calcularSaldoNeto.
 *   2. Indexar cuentas por id y por parentId (Map de hijos).
 *   3. Propagar de hojas a agrupadores recorriendo por nivel descendente.
 *   4. Al propagar: hijo con esContraria=true RESTA; hijo normal SUMA.
 *      Solo esDetalle=true tiene saldo propio.
 *   5. Ensamblar secciones por claseCuenta → subClaseCuenta.
 *      INGRESO/EGRESO NO se incluyen en el árbol.
 *   6. Omitir hojas con saldo 0; omitir agrupadores sin descendientes con saldo.
 *   7. Calcular Resultado del Ejercicio (sobre saldosGestion); insertar como
 *      línea sintética en PATRIMONIO_RESULTADOS.
 *   8. Calcular cuadre: |Activo − (Pasivo + Patrimonio)| ≤ Money.TOLERANCIA_BOB.
 */

import { ClaseCuenta, NaturalezaCuenta, SubClaseCuenta } from '@prisma/client';

import { Money } from '@/common/domain/money';

import type { BalanceArbolResult, CuentaBalanceCalculada, SeccionCalculada, SubseccionCalculada } from '../dto/balance-response.dto';
import type { CuentaEstructuraRow, SaldoCuentaRow } from '../ports/balance-reader.port';
import { calcularSaldoNeto } from './saldo-naturaleza';

// ============================================================
// Tipos internos
// ============================================================

interface NodoArbol {
  cuenta: CuentaEstructuraRow;
  saldoNeto: Money;       // saldo calculado (hoja = saldoNeto directo; agrupador = propagado)
  tieneContenido: boolean; // true si el nodo o algún descendiente tiene saldo ≠ 0
}

// ============================================================
// Parámetros de entrada
// ============================================================

export interface ConstruirBalanceParams {
  estructura: CuentaEstructuraRow[];
  saldosHasta: SaldoCuentaRow[];
  saldosGestion: SaldoCuentaRow[];
}

// ============================================================
// Función principal
// ============================================================

/**
 * Construye el árbol del Balance General a partir de la estructura de cuentas
 * y los saldos calculados por el adapter.
 *
 * Código Tributario art. 47: Activo = Pasivo + Patrimonio (ecuación de la partida doble).
 * NCB: la naturaleza contable de cada cuenta determina el signo de su saldo.
 */
export function construirBalance(params: ConstruirBalanceParams): BalanceArbolResult {
  const { estructura, saldosHasta, saldosGestion } = params;

  // Índice de saldos hasta la fecha de corte
  const saldosHastaMap = new Map<string, SaldoCuentaRow>(saldosHasta.map((s) => [s.cuentaId, s]));

  // Índice de cuentas por id
  const cuentasPorId = new Map<string, CuentaEstructuraRow>(estructura.map((c) => [c.id, c]));

  // Índice de hijos por parentId
  const hijosPorParentId = new Map<string, string[]>();
  for (const cuenta of estructura) {
    if (cuenta.parentId !== null) {
      const lista = hijosPorParentId.get(cuenta.parentId);
      if (lista) {
        lista.push(cuenta.id);
      } else {
        hijosPorParentId.set(cuenta.parentId, [cuenta.id]);
      }
    }
  }

  // Calcular nivel máximo
  const nivelMax = estructura.reduce((max, c) => Math.max(max, c.nivel), 0);

  // Inicializar nodos: hojas tienen saldo propio; agrupadoras arrancan en 0
  const nodos = new Map<string, NodoArbol>();

  for (const cuenta of estructura) {
    if (cuenta.esDetalle) {
      const saldoRow = saldosHastaMap.get(cuenta.id);
      const saldoNeto = saldoRow
        ? calcularSaldoNeto(saldoRow.totalDebitoBob, saldoRow.totalCreditoBob, cuenta.naturaleza)
        : Money.ZERO;

      nodos.set(cuenta.id, {
        cuenta,
        saldoNeto,
        tieneContenido: !saldoNeto.isZero(),
      });
    } else {
      nodos.set(cuenta.id, {
        cuenta,
        saldoNeto: Money.ZERO,
        tieneContenido: false,
      });
    }
  }

  // Propagación de hojas a agrupadores — de nivel más profundo al más alto
  for (let nivel = nivelMax; nivel >= 1; nivel--) {
    const cuentasEnNivel = estructura.filter((c) => c.nivel === nivel && !c.esDetalle);

    for (const agrupador of cuentasEnNivel) {
      const hijos = hijosPorParentId.get(agrupador.id) ?? [];
      let saldoAgrupado = Money.ZERO;
      let tieneContenido = false;

      for (const hijoId of hijos) {
        const hijoNodo = nodos.get(hijoId);
        if (!hijoNodo) continue;

        const hijoTieneContenido = hijoNodo.tieneContenido || !hijoNodo.saldoNeto.isZero();
        if (hijoTieneContenido) tieneContenido = true;

        // NCB + Código Tributario art. 47: cuentas contrarias RESTAN del grupo.
        // Ej: Depreciación Acumulada (esContraria=true) reduce el Activo No Corriente.
        if (hijoNodo.cuenta.esContraria) {
          // La cuenta contraria resta del total de su grupo
          saldoAgrupado = saldoAgrupado.minus(hijoNodo.saldoNeto);
        } else {
          saldoAgrupado = saldoAgrupado.plus(hijoNodo.saldoNeto);
        }
      }

      nodos.set(agrupador.id, {
        cuenta: agrupador,
        saldoNeto: saldoAgrupado,
        tieneContenido,
      });
    }
  }

  // Calcular Resultado del Ejercicio (REQ-BG-09)
  const resultadoEjercicio = calcularResultadoEjercicio(estructura, saldosGestion);

  // Ensamblar árbol por claseCuenta → subClaseCuenta
  const activo = ensamblarSeccion(ClaseCuenta.ACTIVO, 'Activo', estructura, nodos, cuentasPorId, hijosPorParentId);
  const pasivo = ensamblarSeccion(ClaseCuenta.PASIVO, 'Pasivo', estructura, nodos, cuentasPorId, hijosPorParentId);
  const patrimonio = ensamblarSeccionPatrimonio(
    estructura,
    nodos,
    cuentasPorId,
    hijosPorParentId,
    resultadoEjercicio,
  );

  // Calcular cuadre
  // Código Tributario art. 47: Activo = Pasivo + Patrimonio (ecuación de la partida doble).
  const diferenciaBob = activo.totalBob.minus(pasivo.totalBob.plus(patrimonio.totalBob));

  // Código Tributario art. 47: tolerancia ±Bs 0.01 por redondeos de conversión multi-moneda.
  const cuadra = diferenciaBob.abs().lessThanOrEqualTo(Money.TOLERANCIA_BOB);

  return { activo, pasivo, patrimonio, resultadoEjercicioBob: resultadoEjercicio, cuadra, diferenciaBob };
}

// ============================================================
// Resultado del Ejercicio (REQ-BG-09)
// ============================================================

/**
 * Resultado del Ejercicio = Σ saldoNeto(INGRESO) − Σ saldoNeto(EGRESO).
 * Calculado sobre saldosGestion (saldos del rango de gestión, no histórico).
 *
 * NCB: INGRESO es naturaleza ACREEDORA (saldo = haber−debe);
 * EGRESO es DEUDORA (saldo = debe−haber). calcularSaldoNeto da el signo correcto.
 */
function calcularResultadoEjercicio(
  estructura: CuentaEstructuraRow[],
  saldosGestion: SaldoCuentaRow[],
): Money {
  const saldosGestionMap = new Map<string, SaldoCuentaRow>(saldosGestion.map((s) => [s.cuentaId, s]));

  let totalIngreso = Money.ZERO;
  let totalEgreso = Money.ZERO;

  for (const cuenta of estructura) {
    if (!cuenta.esDetalle) continue;

    const saldoRow = saldosGestionMap.get(cuenta.id);
    if (!saldoRow) continue;

    const saldoNeto = calcularSaldoNeto(saldoRow.totalDebitoBob, saldoRow.totalCreditoBob, cuenta.naturaleza);

    if (cuenta.claseCuenta === ClaseCuenta.INGRESO) {
      totalIngreso = totalIngreso.plus(saldoNeto);
    } else if (cuenta.claseCuenta === ClaseCuenta.EGRESO) {
      totalEgreso = totalEgreso.plus(saldoNeto);
    }
  }

  return totalIngreso.minus(totalEgreso);
}

// ============================================================
// Ensamblado de secciones
// ============================================================

/**
 * Recopila las cuentas con contenido de una claseCuenta y las agrupa por subClaseCuenta.
 * INGRESO/EGRESO no se ensamblan como secciones del Balance.
 */
function ensamblarSeccion(
  claseCuenta: ClaseCuenta,
  titulo: string,
  estructura: CuentaEstructuraRow[],
  nodos: Map<string, NodoArbol>,
  cuentasPorId: Map<string, CuentaEstructuraRow>,
  hijosPorParentId: Map<string, string[]>,
): SeccionCalculada {
  const cuentasDeClase = estructura.filter(
    (c) => c.claseCuenta === claseCuenta && c.subClaseCuenta !== null,
  );

  // Agrupar por subClaseCuenta
  const subClasesUnicas = [...new Set(
    cuentasDeClase
      .map((c) => c.subClaseCuenta)
      .filter((s): s is SubClaseCuenta => s !== null),
  )];

  const subsecciones: SubseccionCalculada[] = [];
  let totalSeccion = Money.ZERO;

  for (const subClase of subClasesUnicas) {
    const cuentasDeSubClase = cuentasDeClase.filter((c) => c.subClaseCuenta === subClase);

    // Cuentas raíz de la subclase: sin parent EN LA MISMA CLASE/SUBCLASE
    // (los agrupadores de nivel superior no tienen parent dentro de esta subclase)
    const idsEnSubClase = new Set(cuentasDeSubClase.map((c) => c.id));
    const cuentasRaizDeSubClase = cuentasDeSubClase.filter(
      (c) => c.parentId === null || !idsEnSubClase.has(c.parentId),
    );

    // El total de la subsección = suma de los saldos de sus nodos raíz
    // (ya propagados correctamente con esContraria por el algoritmo de propagación)
    // NCB + Código Tributario art. 47: cuentas contrarias ya restan en la propagación.
    let totalSubClase = Money.ZERO;
    let tieneContenido = false;

    for (const raiz of cuentasRaizDeSubClase) {
      const nodo = nodos.get(raiz.id);
      if (!nodo) continue;
      if (nodo.saldoNeto.isZero() && !nodo.tieneContenido) continue;

      tieneContenido = true;
      // esContraria RESTA del total de la subsección
      // Código Tributario art. 47: cuentas contrarias (ej: Depreciación Acumulada) restan del grupo.
      if (raiz.esContraria) {
        totalSubClase = totalSubClase.minus(nodo.saldoNeto);
      } else {
        totalSubClase = totalSubClase.plus(nodo.saldoNeto);
      }
    }

    if (!tieneContenido) continue;

    const cuentasParaDto = recolectarCuentasParaDto(
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

/**
 * Versión especial para PATRIMONIO: agrega la línea sintética del Resultado del Ejercicio.
 */
function ensamblarSeccionPatrimonio(
  estructura: CuentaEstructuraRow[],
  nodos: Map<string, NodoArbol>,
  cuentasPorId: Map<string, CuentaEstructuraRow>,
  hijosPorParentId: Map<string, string[]>,
  resultadoEjercicio: Money,
): SeccionCalculada {
  const seccionBase = ensamblarSeccion(
    ClaseCuenta.PATRIMONIO,
    'Patrimonio',
    estructura,
    nodos,
    cuentasPorId,
    hijosPorParentId,
  );

  // Agregar línea sintética del Resultado del Ejercicio en PATRIMONIO_RESULTADOS
  // Solo si hay resultado diferente de cero O si hay subsección PATRIMONIO_RESULTADOS
  const lineaSintetica: CuentaBalanceCalculada = {
    cuentaId: null,
    codigoInterno: null,
    nombre: 'Resultado del Ejercicio (en curso)',
    nivel: 1,
    esContraria: false,
    esSintetica: true,
    saldoBob: resultadoEjercicio,
  };

  // Buscar o crear subsección PATRIMONIO_RESULTADOS
  const indexPatrimResult = seccionBase.subsecciones.findIndex(
    (s) => s.subClaseCuenta === SubClaseCuenta.PATRIMONIO_RESULTADOS,
  );

  let totalPatrimonio = seccionBase.totalBob;

  if (indexPatrimResult >= 0) {
    const subseccionExistente = seccionBase.subsecciones[indexPatrimResult]!;
    const cuentasActualizadas = [...subseccionExistente.cuentas, lineaSintetica];
    const totalActualizado = subseccionExistente.totalBob.plus(resultadoEjercicio);
    seccionBase.subsecciones[indexPatrimResult] = {
      ...subseccionExistente,
      cuentas: cuentasActualizadas,
      totalBob: totalActualizado,
    };
    totalPatrimonio = totalPatrimonio.plus(resultadoEjercicio);
  } else if (!resultadoEjercicio.isZero()) {
    // Crear nueva subsección PATRIMONIO_RESULTADOS con la línea sintética
    seccionBase.subsecciones.push({
      subClaseCuenta: SubClaseCuenta.PATRIMONIO_RESULTADOS,
      titulo: 'PATRIMONIO_RESULTADOS',
      cuentas: [lineaSintetica],
      totalBob: resultadoEjercicio,
    });
    totalPatrimonio = totalPatrimonio.plus(resultadoEjercicio);
  }

  return { ...seccionBase, totalBob: totalPatrimonio };
}

/**
 * Recolecta cuentas con contenido (saldo ≠ 0 o con descendientes con saldo)
 * desde un conjunto de cuentas raíz de una subClaseCuenta.
 * Aplana el árbol en una lista preservando el nivel para indentación en UI.
 */
function recolectarCuentasParaDto(
  cuentasRaiz: CuentaEstructuraRow[],
  nodos: Map<string, NodoArbol>,
  hijosPorParentId: Map<string, string[]>,
): CuentaBalanceCalculada[] {
  const resultado: CuentaBalanceCalculada[] = [];

  function recorrer(cuentaId: string) {
    const nodo = nodos.get(cuentaId);
    if (!nodo) return;

    // Omitir cuentas sin contenido (REQ-BG-08)
    if (!nodo.tieneContenido && nodo.saldoNeto.isZero()) return;

    resultado.push({
      cuentaId: nodo.cuenta.id,
      codigoInterno: nodo.cuenta.codigoInterno,
      nombre: nodo.cuenta.nombre,
      nivel: nodo.cuenta.nivel,
      esContraria: nodo.cuenta.esContraria,
      esSintetica: false,
      saldoBob: nodo.saldoNeto,
    });

    const hijos = hijosPorParentId.get(cuentaId) ?? [];
    for (const hijoId of hijos) {
      recorrer(hijoId);
    }
  }

  for (const cuentaRaiz of cuentasRaiz) {
    recorrer(cuentaRaiz.id);
  }

  return resultado;
}
