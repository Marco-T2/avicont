import { Inject, Injectable } from '@nestjs/common';
import type {
  ArranqueConciliado,
  CuentaBancaria,
  EstadoVerificacionExtracto,
  MatchConciliacion,
  Moneda,
  MovimientoBancario,
  OrigenPartidaArranque,
} from '@prisma/client';

import {
  LineaCuentaRow,
  LineasCuentaReaderPort,
  LINEAS_CUENTA_READER_PORT,
} from '@/comprobantes/ports/lineas-cuenta-reader.port';
import { FechaContable } from '@/common/domain/fecha-contable';
import { Money } from '@/common/domain/money';
import { UsuarioReaderPort, USUARIO_READER_PORT } from '@/users/ports/usuario-reader.port';

import { CuentasBancariasService } from './cuentas-bancarias.service';
import {
  armarInforme,
  DetalleLineaEnTransito,
  DetalleMovimientoIgnorado,
  DetalleMovimientoPendiente,
  InformeConciliacion,
  LineaParaInforme,
  MovimientoParaInforme,
} from './domain/armar-informe';
import { detectarHuecos, detectarHuecosDeBorde } from './domain/cobertura-extracto';
import { detectarDiscontinuidades } from './domain/continuidad-extractos';
import {
  derivarEstadoEfectivoLinea,
  derivarEstadoEfectivoMovimiento,
} from './domain/estado-efectivo';
import {
  ArranqueYaAnuladoError,
  ConciliacionMonedaNoSoportadaError,
  PartidasDeArranqueDesconocidasError,
} from './domain/informe-errors';
import { verificarAnclas } from './domain/verificar-anclas';
import { aLineaContableActual, aSnapshot, claveAncla, ladoYMonto } from './mapeo-linea-contable';
import {
  ArranqueConciliadoRepositoryPort,
  ARRANQUE_CONCILIADO_REPOSITORY_PORT,
  PartidaAbiertaCreateData,
} from './ports/arranque-conciliado.repository.port';
import {
  CoberturaImportacionRow,
  ImportacionExtractoRepositoryPort,
  IMPORTACION_EXTRACTO_REPOSITORY_PORT,
} from './ports/importacion-extracto.repository.port';
import {
  MatchConciliacionRepositoryPort,
  MATCH_CONCILIACION_REPOSITORY_PORT,
} from './ports/match-conciliacion.repository.port';
import {
  MovimientoBancarioRepositoryPort,
  MOVIMIENTO_BANCARIO_REPOSITORY_PORT,
  SaldoVigenteRow,
} from './ports/movimiento-bancario.repository.port';

/**
 * Piso del escaneo que congela las partidas abiertas: `@db.Date`, así que
 * medianoche UTC (§4.6). No hay "sin fecha desde" en el port de rango, y una
 * organización boliviana no tiene asientos anteriores a esto.
 */
const ORIGEN_DE_LOS_TIEMPOS = new Date('1900-01-01T00:00:00.000Z');

// ============================================================
// Consulta y resultado — dominio en Money/FechaContable; el DTO
// de borde (montos STRING §4.5) vive en `dto/` (task 3.7/3.8)
// ============================================================

export interface ConsultaInforme {
  cuentaBancariaId: string;
  /** Fecha de corte, `@db.Date`-like (medianoche UTC, §4.6). */
  corte: Date;
}

export interface CuentaBancariaInformeView {
  id: string;
  alias: string;
  cuentaId: string;
  moneda: Moneda;
  numeroCuenta: string | null;
}

/** La declaración de arranque que APLICA al corte (REQ-ICB-04): acto atribuido. */
export interface ArranqueAplicadoView {
  id: string;
  fecha: FechaContable;
  saldoExtracto: Money;
  saldoLibros: Money;
  /** DECLARADA por el usuario — jamás calculada (ver `ArranqueParaInforme`). */
  diferenciaResidual: Money;
  nota: string | null;
  declaradoPorUserId: string;
  /**
   * Identidad presentable de quien declaró (`displayName` o, en su defecto, el
   * email). `null` cuando el id no resuelve dentro del tenant — un acto viejo
   * de alguien que ya no es miembro. REQ-ICB-04 pide un acto ATRIBUIDO y un
   * UUID no atribuye a una persona; el id se conserva igual para trazabilidad.
   */
  declaradoPorNombre: string | null;
  declaradoEl: Date;
  /**
   * Anulada ⇒ deja de aplicar en `vigenteA`, pero NO desaparece: sigue en el
   * historial con su marca, su motivo y su autor (§4.7). Que alguien haya
   * fijado mal el punto de partida es parte del rastro.
   */
  anulado: boolean;
  motivoAnulacion: string | null;
  anuladoPorUserId: string | null;
  anuladoPorNombre: string | null;
  anuladoEl: Date | null;
}

/**
 * Motivos por los que el informe NO afirma "conciliado" (REQ-ICB-04/05/06).
 * La confiabilidad CALIFICA el resultado, nunca lo suprime: el informe se
 * emite siempre — lo que se retiene es la conclusión.
 */
export type MotivoNoConciliado =
  | { tipo: 'SIN_ARRANQUE' }
  | { tipo: 'SIN_SALDO_EXTRACTO' }
  /**
   * El `saldoExtracto` DECLARADO en el arranque vigente no coincide con el
   * saldo REAL del extracto a la fecha del arranque (misma tolerancia que la
   * continuidad entre extractos). Puede convivir con residuo 0.00: un residual
   * "correcto" cierra la identidad aunque el saldo declarado sea basura — por
   * eso se contrasta aparte. `diferencia` siempre positiva (|declarado − real|).
   */
  | {
      tipo: 'ARRANQUE_EXTRACTO_NO_COINCIDE';
      fecha: FechaContable;
      declarado: Money;
      real: Money;
      diferencia: Money;
    }
  /**
   * Simétrico del anterior sobre el lado LIBROS: el `saldoLibros` DECLARADO en
   * el arranque no coincide con el agregado real del mayor a esa fecha. El
   * residual que el usuario declaró se apoya en ese saldo — si el saldo es
   * otro, el residual razona sobre una premisa falsa. A diferencia del
   * extracto, el mayor SIEMPRE tiene valor (sin líneas agrega cero), así que
   * `real` nunca es nulo: cuando la organización arranca sin asiento de
   * apertura, este motivo es precisamente el que lo dice.
   */
  | {
      tipo: 'ARRANQUE_LIBROS_NO_COINCIDE';
      fecha: FechaContable;
      declarado: Money;
      real: Money;
      diferencia: Money;
    }
  | { tipo: 'DESCUADRE'; importacionId: string }
  | { tipo: 'HUECO'; desde: FechaContable; hasta: FechaContable }
  /**
   * El tramo entre el arranque y la primera importación que lo sigue: el
   * informe compara sobre datos que NINGÚN extracto cubrió. `HUECO` no puede
   * verlo —no hay importación anterior contra la cual sea un hueco— y su
   * ausencia se lee como "todo cubierto", que es peor que no preguntar.
   */
  | { tipo: 'HUECO_INICIAL'; desde: FechaContable; hasta: FechaContable }
  /**
   * Simétrico al cierre: la cobertura termina antes del corte pedido. El
   * `saldoExtracto` contra el que se concilia es entonces el del último
   * movimiento importado, VIEJO respecto del corte — la identidad cierra igual
   * y el número no es el del día que se pidió.
   */
  | { tipo: 'HUECO_FINAL'; desde: FechaContable; hasta: FechaContable }
  | { tipo: 'DISCONTINUIDAD'; anteriorId: string; siguienteId: string; diferencia: Money }
  | { tipo: 'RESIDUO_NO_EXPLICADO'; importe: Money };

export interface ConfiabilidadInforme {
  /** true solo con arranque, saldo publicado, insumos sanos y residuo CERO exacto. */
  conciliado: boolean;
  motivos: MotivoNoConciliado[];
}

/** Trazabilidad de un insumo (REQ-ICB-08): con qué se calculó el informe. */
export interface ImportacionInsumoView {
  id: string;
  fechaDesde: FechaContable;
  fechaHasta: FechaContable;
  estadoVerificacion: EstadoVerificacionExtracto;
}

export interface InformeConciliacionResultado {
  cuentaBancaria: CuentaBancariaInformeView;
  corte: FechaContable;
  /** `null` honesto: ningún movimiento ≤ corte publica saldo (REQ-ICB-03). */
  saldoExtracto: Money | null;
  saldoLibros: Money;
  /** `null` ⇔ sin arranque declarado: el informe se emite ABSTENIDO (REQ-ICB-04). */
  arranque: ArranqueAplicadoView | null;
  /** `null` cuando no hay arranque: sin punto de partida no hay identidad. */
  partidas: InformeConciliacion['partidas'] | null;
  /** `null` sin arranque o sin saldo de extracto: sin dato no hay veredicto. */
  residuo: Money | null;
  confiabilidad: ConfiabilidadInforme;
  /** REQ-ICB-08: importaciones que cubren el rango, con su estado de verificación. */
  insumos: { importaciones: ImportacionInsumoView[] };
}

/**
 * Una partida que el sistema PROPONE arrastrar al declarar el arranque.
 *
 * Es una propuesta, no un veredicto: una línea contable anterior al arranque
 * sin movimiento que la reclame puede ser un cheque en circulación —que SÍ hay
 * que arrastrar— o el asiento de apertura, cuyo saldo YA está dentro del
 * extracto declarado. Con los datos disponibles esas dos cosas son
 * indistinguibles: si la organización importó extractos recién desde el
 * arranque, TODA línea anterior parece en tránsito.
 *
 * Por eso decide el contador. El sistema aporta lo que sabe (la lista y los
 * importes exactos) y la aritmética que lo verifica: la suma de lo que se
 * confirme debe dar `saldoLibros − saldoExtracto + diferenciaResidual`.
 */
export interface CandidatoPartidaArranque {
  /** Id estable con el que el cliente confirma: `MOV:<id>` o `LIN:<comprobanteId>:<orden>`. */
  referencia: string;
  origen: OrigenPartidaArranque;
  fecha: FechaContable;
  /** Contribución FIRMADA extracto→libros. Sale del dato, nunca del cliente. */
  importe: Money;
  /** Glosa (líneas) o descripción del extracto (movimientos): con esto una persona reconoce cuál es cuál. */
  descripcion: string;
  /**
   * Solo en `LINEA`. Permite ABRIR el asiento sin abandonar la declaración:
   * decidir si un comprobante de junio es un cheque en circulación o la
   * apertura muchas veces exige ver el asiento entero, no su glosa.
   */
  comprobanteId: string | null;
  /** Solo en `LINEA`, y solo si el comprobante ya fue numerado. */
  numeroComprobante: string | null;
}

/** Los CUATRO datos del arranque, DECLARADOS por el usuario (REQ-ICB-04). */
export interface DeclaracionArranque {
  cuentaBancariaId: string;
  /** Corte del arranque — `@db.Date`-like (medianoche UTC, §4.6). */
  fecha: Date;
  saldoExtracto: Money;
  saldoLibros: Money;
  /**
   * DECLARADA, jamás derivada: positiva cuando el extracto queda por encima
   * de los libros (convención fijada en `ArranqueParaInforme`).
   */
  diferenciaResidual: Money;
  nota: string | null;
  /**
   * Las partidas abiertas que el usuario CONFIRMÓ arrastrar, por referencia.
   * El servidor re-deriva los candidatos y se queda con estas: el cliente
   * elige cuáles, nunca cuánto — los importes salen del dato.
   */
  referenciasPartidas: readonly string[];
}

/** Vínculo verificado de un match: la línea ACTUAL resuelta + motivo de rotura. */
interface VinculoVerificado {
  match: MatchConciliacion;
  lineaActual: LineaCuentaRow | null;
  roto: ReturnType<typeof verificarAnclas>['motivo'];
}

/**
 * El informe de conciliación (REQ-ICB-01..08): arma los insumos de
 * `armarInforme` — la identidad vive ENTERA en el dominio puro, acá solo se
 * cargan y clasifican datos.
 *
 * - Lado banco: `saldosVigentes` (REQ-VMB-08/09) filtrado a la cuenta (D2).
 * - Lado libros: el agregado REAL del mayor acumulado al corte (D1) — nunca
 *   el saldo declarado en el arranque. El declarado se usa SOLO para
 *   contrastarlo contra el mayor a su fecha (`ARRANQUE_LIBROS_NO_COINCIDE`),
 *   simétrico al contraste del lado banco.
 * - Estados: `domain/estado-efectivo.ts`, el MISMO código que el workspace
 *   (D4) — un match roto se interpreta igual en ambas superficies.
 *
 * **Una lectura NUNCA escribe** (REQ-ICB-04): consultar el informe jamás crea,
 * modifica ni infiere un arranque. Sin arranque declarado el informe se emite
 * ABSTENIDO — con los saldos, sin identidad — porque lo que se retiene es la
 * conclusión, nunca el dato (REQ-ICB-05).
 */
@Injectable()
export class InformeConciliacionService {
  constructor(
    private readonly cuentasBancarias: CuentasBancariasService,
    @Inject(ARRANQUE_CONCILIADO_REPOSITORY_PORT)
    private readonly arranques: ArranqueConciliadoRepositoryPort,
    @Inject(MOVIMIENTO_BANCARIO_REPOSITORY_PORT)
    private readonly movimientos: MovimientoBancarioRepositoryPort,
    @Inject(MATCH_CONCILIACION_REPOSITORY_PORT)
    private readonly matches: MatchConciliacionRepositoryPort,
    @Inject(LINEAS_CUENTA_READER_PORT)
    private readonly lineasCuenta: LineasCuentaReaderPort,
    @Inject(IMPORTACION_EXTRACTO_REPOSITORY_PORT)
    private readonly importaciones: ImportacionExtractoRepositoryPort,
    @Inject(USUARIO_READER_PORT)
    private readonly usuarios: UsuarioReaderPort,
  ) {}

  /**
   * Resuelve `userId → nombre presentable`, acotado a los miembros del tenant.
   * Un id que no resuelve simplemente no entra al mapa: el acto se muestra sin
   * nombre en vez de con un UUID o con un dato de otra organización.
   */
  private async nombresPorUserId(
    tenantId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>> {
    const filas = await this.usuarios.listarPorIds(tenantId, userIds);
    return new Map(filas.map((u) => [u.id, u.displayName ?? u.email]));
  }

  async obtenerInforme(
    tenantId: string,
    consulta: ConsultaInforme,
  ): Promise<InformeConciliacionResultado> {
    // 404 si la cuenta no existe o es de otro tenant (REQ-ICB-09).
    const cuentaBancaria = await this.cuentasBancarias.findById(
      tenantId,
      consulta.cuentaBancariaId,
    );
    this.exigirMonedaSoportada(cuentaBancaria);

    const corte = FechaContable.fromDbDate(consulta.corte);
    const vista = aCuentaView(cuentaBancaria);

    const [arranqueRow, saldos, cobertura] = await Promise.all([
      this.arranques.vigenteA(tenantId, cuentaBancaria.id, consulta.corte),
      this.movimientos.saldosVigentes(tenantId, consulta.corte),
      this.importaciones.listarCoberturaPorCuentaBancaria(tenantId, cuentaBancaria.id),
    ]);
    const saldoExtracto = saldoDeCuenta(saldos, cuentaBancaria.id);

    if (arranqueRow === null) {
      // ABSTENIDO (REQ-ICB-04): sin punto de arranque no hay identidad, pero
      // el informe se emite igual con ambos saldos. Sin ventana acotada
      // tampoco se acarrean movimientos ni líneas (D3) — el agregado es una
      // sola fila en Postgres.
      const suma = await this.lineasCuenta.sumarPorCuentaHasta(tenantId, {
        cuentaId: cuentaBancaria.cuentaId,
        hasta: consulta.corte,
      });
      return {
        cuentaBancaria: vista,
        corte,
        saldoExtracto,
        saldoLibros: Money.of(suma.totalDebito).minus(suma.totalCredito),
        arranque: null,
        partidas: null,
        residuo: null,
        ...derivarConfiabilidad({
          corte,
          arranqueFecha: null,
          arranqueExtracto: null,
          arranqueLibros: null,
          saldoExtracto,
          residuo: null,
          cobertura,
        }),
      };
    }

    const arranqueFecha = FechaContable.fromDbDate(arranqueRow.fecha);
    // Ventana D3: `arranque.fecha < fecha ≤ corte`. Los listados por rango son
    // inclusivos ⇒ arrancan el día SIGUIENTE al arranque.
    const desdeVentana = arranqueFecha.sumarDias(1).toDbDate();

    const [movs, lineas, sumaAlCorte, sumaAlArranque, saldosAlArranque] = await Promise.all([
      this.movimientos.listarPorCuentaBancariaEnRango(tenantId, cuentaBancaria.id, {
        fechaDesde: desdeVentana,
        fechaHasta: consulta.corte,
      }),
      this.lineasCuenta.listarPorCuentaEnRango(tenantId, {
        cuentaId: cuentaBancaria.cuentaId,
        fechaDesde: desdeVentana,
        fechaHasta: consulta.corte,
      }),
      // El saldo según libros es el del MAYOR, acumulado desde el origen — NO
      // `arranque.saldoLibros + delta`. El informe existe para justificar el
      // saldo de Bancos ante un auditor (proposal §Intent) y un número
      // declarado no respalda un asiento. La cota de rendimiento del arranque
      // (D3) aplica al LISTADO del puente, no a este agregado: es una sola
      // fila de Postgres, la misma consulta que ya usa la rama abstenida.
      this.lineasCuenta.sumarPorCuentaHasta(tenantId, {
        cuentaId: cuentaBancaria.cuentaId,
        hasta: consulta.corte,
      }),
      // Contraste del lado libros: el mayor real A LA FECHA DEL ARRANQUE,
      // contra el `saldoLibros` DECLARADO.
      this.lineasCuenta.sumarPorCuentaHasta(tenantId, {
        cuentaId: cuentaBancaria.cuentaId,
        hasta: arranqueRow.fecha,
      }),
      // Contraste del arranque: el saldo REAL del extracto A LA FECHA DEL
      // ARRANQUE (no al corte) — la misma consulta `saldosVigentes` con otra
      // fecha. Contra él se valida el `saldoExtracto` DECLARADO.
      this.movimientos.saldosVigentes(tenantId, arranqueRow.fecha),
    ]);

    const vinculos = await this.verificarVinculos(tenantId, movs, lineas);
    const reclamos = await this.resolverReclamosDeLineas(tenantId, movs, vinculos);
    const nombres = await this.nombresPorUserId(tenantId, [arranqueRow.declaradoPorUserId]);
    const delArranque = await this.partidasDelArranqueAunAbiertas(tenantId, arranqueRow.id, corte);

    const informe = armarInforme({
      corte,
      arranque: {
        fecha: arranqueFecha,
        diferenciaResidual: Money.of(arranqueRow.diferenciaResidual),
      },
      saldoExtracto,
      saldoLibros: Money.of(sumaAlCorte.totalDebito).minus(sumaAlCorte.totalCredito),
      movimientos: movs.map((mov) => aMovimientoParaInforme(mov, vinculos.get(mov.id) ?? null)),
      lineas: lineas.map((fila) => aLineaParaInforme(fila, reclamos)),
      pendientesDelArranque: delArranque.pendientes,
      ignoradosDelArranque: delArranque.ignorados,
      enTransitoDelArranque: delArranque.enTransito,
    });

    return {
      cuentaBancaria: vista,
      corte,
      saldoExtracto: informe.saldoExtracto,
      saldoLibros: informe.saldoLibros,
      arranque: aArranqueAplicadoView(
        arranqueRow,
        nombres.get(arranqueRow.declaradoPorUserId) ?? null,
      ),
      partidas: informe.partidas,
      residuo: informe.residuo,
      ...derivarConfiabilidad({
        corte,
        arranqueFecha,
        arranqueExtracto: {
          declarado: Money.of(arranqueRow.saldoExtracto),
          real: saldoDeCuenta(saldosAlArranque, cuentaBancaria.id),
        },
        arranqueLibros: {
          declarado: Money.of(arranqueRow.saldoLibros),
          real: Money.of(sumaAlArranque.totalDebito).minus(sumaAlArranque.totalCredito),
        },
        saldoExtracto,
        residuo: informe.residuo,
        cobertura,
      }),
    };
  }

  /**
   * Declara un punto de arranque conciliado (REQ-ICB-04): comando EXPLÍCITO,
   * append-only, atribuido. Los CUATRO datos — fecha, ambos saldos y la
   * diferencia residual — vienen DECLARADOS por el usuario: la residual es la
   * parte que asume como inexplicable y JAMÁS se calcula como
   * `saldoExtracto − saldoLibros` (esa resta congelaría las partidas en
   * tránsito abiertas a esa fecha y las cobraría dos veces — ver
   * `ArranqueParaInforme`). Una declaración con fecha anterior a otra
   * existente se ACEPTA (D8): `vigenteA` decide cuál aplica y el historial
   * conserva todas.
   */
  async declararArranque(
    tenantId: string,
    userId: string,
    declaracion: DeclaracionArranque,
  ): Promise<ArranqueAplicadoView> {
    // 404 si la cuenta no existe o es de otro tenant (REQ-ICB-09).
    const cuentaBancaria = await this.cuentasBancarias.findById(
      tenantId,
      declaracion.cuentaBancariaId,
    );
    // Un arranque sobre una cuenta no conciliable fijaría un punto de partida
    // que ningún informe podrá usar (v1 = BOB).
    this.exigirMonedaSoportada(cuentaBancaria);

    // Se re-derivan los candidatos y se conservan SOLO los confirmados. El
    // cliente manda referencias, no importes: así no puede inventar una
    // partida ni torcer un monto para hacer cerrar la identidad.
    const candidatos = await this.calcularCandidatosA(tenantId, cuentaBancaria, declaracion.fecha);
    const porReferencia = new Map(candidatos.map((c) => [c.referencia, c]));
    const desconocidas = declaracion.referenciasPartidas.filter((r) => !porReferencia.has(r));
    if (desconocidas.length > 0) {
      // Falla fuerte en vez de descartar en silencio: una referencia que no
      // resuelve significa que el cliente vio otra foto de la cuenta que la
      // que hay ahora, y declarar sobre una foto vieja es justamente lo que
      // este acto no puede permitirse.
      throw new PartidasDeArranqueDesconocidasError(desconocidas);
    }
    const partidasAbiertas = declaracion.referenciasPartidas.map((r) =>
      this.aPartidaCreate(porReferencia.get(r) as CandidatoPartidaArranque),
    );

    const creado = await this.arranques.crear(tenantId, {
      cuentaBancariaId: cuentaBancaria.id,
      fecha: declaracion.fecha,
      partidasAbiertas,
      saldoExtracto: declaracion.saldoExtracto.toPrismaDecimal(),
      saldoLibros: declaracion.saldoLibros.toPrismaDecimal(),
      diferenciaResidual: declaracion.diferenciaResidual.toPrismaDecimal(),
      nota: declaracion.nota,
      declaradoPorUserId: userId,
    });

    const nombres = await this.nombresPorUserId(tenantId, [userId]);
    return aArranqueAplicadoView(creado, nombres.get(userId) ?? null);
  }

  /**
   * Anula una declaración de arranque (REQ-ICB-04, §4.7).
   *
   * Marca, jamás borra: el acto se conserva y sigue visible en el historial.
   * Deja de aplicar en `vigenteA`, así que el informe pasa a usar la
   * declaración anterior — o se emite ABSTENIDO si no queda ninguna.
   *
   * Es la salida que faltaba. "Corregir declarando otra" solo sirve cuando el
   * error NO fue la fecha: declarada una al 31/12 por equivocación, ninguna
   * anterior puede ganarle al desempate, y la cuenta quedaba con un punto de
   * partida falso para siempre.
   *
   * Exige el mismo permiso que declarar (`conciliar`, D7): deshacer el saldo
   * de partida pesa tanto como fijarlo.
   */
  async anularArranque(
    tenantId: string,
    userId: string,
    cuentaBancariaId: string,
    arranqueId: string,
    motivo: string,
  ): Promise<ArranqueAplicadoView> {
    // 404 si la cuenta no existe o es de otro tenant (REQ-ICB-09). La cuenta
    // se resuelve ANTES para que un id de arranque ajeno no revele nada.
    await this.cuentasBancarias.findById(tenantId, cuentaBancariaId);

    const anulado = await this.arranques.anular(tenantId, arranqueId, {
      motivo,
      anuladoPorUserId: userId,
      fechaAnulacion: new Date(),
    });
    if (anulado === null) throw new ArranqueYaAnuladoError(arranqueId);

    const nombres = await this.nombresPorUserId(tenantId, [anulado.declaradoPorUserId, userId]);
    return aArranqueAplicadoView(
      anulado,
      nombres.get(anulado.declaradoPorUserId) ?? null,
      nombres.get(userId) ?? null,
    );
  }

  /**
   * Historial COMPLETO de declaraciones de una cuenta bancaria (REQ-ICB-04,
   * D8): la UI muestra todas y señala cuál aplica a un corte — como el orden
   * del repo es `fecha DESC, createdAt DESC` (el MISMO desempate que
   * `vigenteA`), la vigente a un corte es la PRIMERA fila con `fecha <= corte`,
   * sin re-ordenar.
   *
   * Lectura pura: 404 si la cuenta no existe o es de otro tenant (REQ-ICB-09).
   * No exige moneda BOB — listar actos ya declarados no computa la identidad,
   * a diferencia del informe.
   */
  async listarHistorial(
    tenantId: string,
    cuentaBancariaId: string,
  ): Promise<ArranqueAplicadoView[]> {
    const cuentaBancaria = await this.cuentasBancarias.findById(tenantId, cuentaBancariaId);
    const filas = await this.arranques.listarHistorial(tenantId, cuentaBancaria.id);
    const nombres = await this.nombresPorUserId(tenantId, [
      ...filas.map((f) => f.declaradoPorUserId),
      ...filas.map((f) => f.anuladoPorUserId).filter((id): id is string => id !== null),
    ]);
    return filas.map((f) =>
      aArranqueAplicadoView(
        f,
        nombres.get(f.declaradoPorUserId) ?? null,
        f.anuladoPorUserId === null ? null : (nombres.get(f.anuladoPorUserId) ?? null),
      ),
    );
  }

  // ============================================================
  // Verificación de vínculos — el MISMO criterio que el workspace
  // ============================================================

  /**
   * Junta los matches por AMBAS patas — por movimiento (los de la ventana) y
   * por ancla (los que reclaman líneas de la ventana desde un movimiento
   * fuera de ella) — y verifica cada uno contra su snapshot resolviendo la
   * línea ACTUAL: primero en la ventana, y las huérfanas con una consulta
   * batch de diagnóstico (mismo techo que el workspace: 1 query extra).
   */
  private async verificarVinculos(
    tenantId: string,
    movs: readonly MovimientoBancario[],
    lineas: readonly LineaCuentaRow[],
  ): Promise<Map<string, VinculoVerificado>> {
    const [porMovimiento, porAnclaVentana] = await Promise.all([
      this.matches.listarPorMovimientos(
        tenantId,
        movs.map((m) => m.id),
      ),
      this.matches.listarPorAnclas(
        tenantId,
        lineas.map((l) => ({ comprobanteId: l.comprobanteId, orden: l.orden })),
      ),
    ]);
    const matchesUnicos = new Map<string, MatchConciliacion>();
    for (const match of [...porMovimiento, ...porAnclaVentana]) {
      matchesUnicos.set(match.id, match);
    }

    const porAncla = new Map<string, LineaCuentaRow>();
    for (const linea of lineas) {
      porAncla.set(claveAncla(linea.comprobanteId, linea.orden), linea);
    }
    const huerfanas = [...matchesUnicos.values()]
      .filter((m) => !porAncla.has(claveAncla(m.comprobanteId, m.orden)))
      .map((m) => ({ comprobanteId: m.comprobanteId, orden: m.orden }));
    if (huerfanas.length > 0) {
      const diagnostico = await this.lineasCuenta.listarPorAnclas(tenantId, huerfanas);
      for (const linea of diagnostico) {
        porAncla.set(claveAncla(linea.comprobanteId, linea.orden), linea);
      }
    }

    const resultado = new Map<string, VinculoVerificado>();
    for (const match of matchesUnicos.values()) {
      const lineaActual = porAncla.get(claveAncla(match.comprobanteId, match.orden)) ?? null;
      const { motivo } = verificarAnclas(
        aSnapshot(match),
        lineaActual === null ? null : aLineaContableActual(lineaActual),
      );
      resultado.set(match.movimientoBancarioId, { match, lineaActual, roto: motivo });
    }
    return resultado;
  }

  /**
   * Las partidas ABIERTAS a la fecha del arranque, en el momento de declararlo.
   *
   * Este es el ÚNICO lugar donde se paga el escaneo desde el origen de la
   * cuenta, y se paga una vez por declaración en vez de una vez por informe.
   * Es también el único momento en que se puede: el ancla `(comprobanteId,
   * orden)` no tiene FK, así que "líneas sin match" no se puede preguntar en
   * una query — hay que traerlas y cruzarlas, y eso solo es tolerable acá.
   *
   * Abierta = su contraparte no existe, o existe pero es POSTERIOR a la fecha
   * del arranque. La derivación usa `estado-efectivo.ts`, el MISMO código que
   * el workspace y el informe (D4).
   */
  async listarCandidatosDeArranque(
    tenantId: string,
    cuentaBancariaId: string,
    fecha: Date,
  ): Promise<CandidatoPartidaArranque[]> {
    const cuentaBancaria = await this.cuentasBancarias.findById(tenantId, cuentaBancariaId);
    this.exigirMonedaSoportada(cuentaBancaria);
    return this.calcularCandidatosA(tenantId, cuentaBancaria, fecha);
  }

  private async calcularCandidatosA(
    tenantId: string,
    cuentaBancaria: CuentaBancaria,
    fecha: Date,
  ): Promise<CandidatoPartidaArranque[]> {
    const corteArranque = FechaContable.fromDbDate(fecha);
    const [movs, lineas] = await Promise.all([
      this.movimientos.listarPorCuentaBancariaEnRango(tenantId, cuentaBancaria.id, {
        fechaDesde: ORIGEN_DE_LOS_TIEMPOS,
        fechaHasta: fecha,
      }),
      this.lineasCuenta.listarPorCuentaEnRango(tenantId, {
        cuentaId: cuentaBancaria.cuentaId,
        fechaDesde: ORIGEN_DE_LOS_TIEMPOS,
        fechaHasta: fecha,
      }),
    ]);

    const vinculos = await this.verificarVinculos(tenantId, movs, lineas);
    const reclamos = await this.resolverReclamosDeLineas(tenantId, movs, vinculos);

    const candidatos: CandidatoPartidaArranque[] = [];

    for (const mov of movs) {
      const estado = derivarEstadoEfectivoMovimiento(
        mov.estado,
        (() => {
          const v = vinculos.get(mov.id);
          return v === undefined ? null : { roto: v.roto };
        })(),
      );
      if (estado === 'CONCILIADO') {
        const lineaActual = vinculos.get(mov.id)?.lineaActual ?? null;
        // Con el asiento ≤ arranque el par ya está en ambos saldos declarados:
        // cerrado, no es partida. Con el asiento posterior, sigue abierto.
        if (
          lineaActual !== null &&
          !FechaContable.fromDbDate(lineaActual.fechaContable).isAfter(corteArranque)
        ) {
          continue;
        }
      }
      // Mismo signo que `armarInforme`: un CREDITO bancario ya está en el
      // extracto y falta en libros ⇒ para llegar a libros se RESTA.
      const monto = Money.of(mov.monto);
      candidatos.push({
        referencia: `MOV:${mov.id}`,
        origen: estado === 'IGNORADO' ? 'MOVIMIENTO_IGNORADO' : 'MOVIMIENTO_PENDIENTE',
        fecha: FechaContable.fromDbDate(mov.fecha),
        importe: mov.tipo === 'CREDITO' ? Money.ZERO.minus(monto) : monto,
        descripcion: mov.descripcion,
        comprobanteId: null,
        numeroComprobante: null,
      });
    }

    for (const fila of lineas) {
      const reclamadaEl = reclamos.get(claveAncla(fila.comprobanteId, fila.orden)) ?? null;
      if (reclamadaEl !== null && !reclamadaEl.isAfter(corteArranque)) continue;
      const { tipo, monto } = ladoYMonto(fila);
      candidatos.push({
        referencia: `LIN:${fila.comprobanteId}:${fila.orden}`,
        origen: 'LINEA',
        fecha: FechaContable.fromDbDate(fila.fechaContable),
        importe: tipo === 'DEBITO' ? monto : Money.ZERO.minus(monto),
        // Glosa y número van SEPARADOS: el número es el ancla clickeable
        // hacia el asiento, la glosa el texto que lo describe.
        descripcion: fila.glosa,
        comprobanteId: fila.comprobanteId,
        numeroComprobante: fila.numeroComprobante,
      });
    }

    return candidatos;
  }

  /** `referencia` → fila persistible. El importe sale del dato, no del cliente. */
  private aPartidaCreate(c: CandidatoPartidaArranque): PartidaAbiertaCreateData {
    const [prefijo, ...resto] = c.referencia.split(':');
    return prefijo === 'MOV'
      ? {
          origen: c.origen,
          movimientoBancarioId: resto[0] ?? '',
          comprobanteId: null,
          orden: null,
          fecha: c.fecha.toDbDate(),
          importe: c.importe.toPrismaDecimal(),
        }
      : {
          origen: 'LINEA',
          movimientoBancarioId: null,
          comprobanteId: resto[0] ?? '',
          orden: Number(resto[1] ?? 0),
          fecha: c.fecha.toDbDate(),
          importe: c.importe.toPrismaDecimal(),
        };
  }

  /**
   * Las partidas congeladas al declarar el arranque que SIGUEN abiertas al
   * corte, ya en forma de detalle.
   *
   * Congelarlas resolvió el problema de encontrarlas (el ancla no tiene FK y
   * el SQL crudo contra el núcleo contable está vedado); saber si se cerraron
   * DESPUÉS es otra pregunta, y esta sí es barata: la lista es chica, así que
   * se verifica con los mismos ports acotados que usa la ventana. Una partida
   * cuya contraparte llegó dentro de `(arranque, corte]` YA está en ambos
   * saldos y sumarla la cobraría dos veces.
   */
  private async partidasDelArranqueAunAbiertas(
    tenantId: string,
    arranqueId: string,
    corte: FechaContable,
  ): Promise<{
    pendientes: DetalleMovimientoPendiente[];
    ignorados: DetalleMovimientoIgnorado[];
    enTransito: DetalleLineaEnTransito[];
  }> {
    const congeladas = await this.arranques.listarPartidasAbiertas(tenantId, arranqueId);
    const vacio = { pendientes: [], ignorados: [], enTransito: [] };
    if (congeladas.length === 0) return vacio;

    const movIds = congeladas
      .map((p) => p.movimientoBancarioId)
      .filter((id): id is string => id !== null);
    const anclas = congeladas
      .filter((p) => p.comprobanteId !== null && p.orden !== null)
      .map((p) => ({ comprobanteId: p.comprobanteId as string, orden: p.orden as number }));

    // Contraparte de los movimientos congelados: el asiento que los reclama.
    const movs = movIds.length > 0 ? await this.movimientos.listarPorIds(tenantId, movIds) : [];
    const vinculos = await this.verificarVinculos(tenantId, movs, []);

    // Contraparte de las líneas congeladas: el movimiento que las reclama.
    const matchesPorAncla =
      anclas.length > 0 ? await this.matches.listarPorAnclas(tenantId, anclas) : [];
    const lineasActuales =
      anclas.length > 0 ? await this.lineasCuenta.listarPorAnclas(tenantId, anclas) : [];
    const lineaPorAncla = new Map(
      lineasActuales.map((l) => [claveAncla(l.comprobanteId, l.orden), l]),
    );
    const movsDeAnclas =
      matchesPorAncla.length > 0
        ? await this.movimientos.listarPorIds(
            tenantId,
            matchesPorAncla.map((m) => m.movimientoBancarioId),
          )
        : [];
    const fechaMovPorId = new Map(
      movsDeAnclas.map((m) => [m.id, FechaContable.fromDbDate(m.fecha)]),
    );
    const cierrePorAncla = new Map<string, FechaContable>();
    for (const match of matchesPorAncla) {
      const clave = claveAncla(match.comprobanteId, match.orden);
      const lineaActual = lineaPorAncla.get(clave) ?? null;
      // Un vínculo ROTO no cierra nada: la línea vuelve al pool, igual que en
      // el workspace (REQ-CB-11). El MISMO criterio que la ventana.
      const { motivo } = verificarAnclas(
        aSnapshot(match),
        lineaActual === null ? null : aLineaContableActual(lineaActual),
      );
      if (motivo !== null) continue;
      const fechaMov = fechaMovPorId.get(match.movimientoBancarioId);
      if (fechaMov !== undefined) cierrePorAncla.set(clave, fechaMov);
    }

    const resultado = {
      pendientes: [] as DetalleMovimientoPendiente[],
      ignorados: [] as DetalleMovimientoIgnorado[],
      enTransito: [] as DetalleLineaEnTransito[],
    };

    for (const partida of congeladas) {
      const fecha = FechaContable.fromDbDate(partida.fecha);
      const importe = Money.of(partida.importe);

      if (partida.origen === 'LINEA') {
        const clave = claveAncla(partida.comprobanteId ?? '', partida.orden ?? 0);
        const cerradaEl = cierrePorAncla.get(clave);
        if (cerradaEl !== undefined && !cerradaEl.isAfter(corte)) continue;
        resultado.enTransito.push({
          comprobanteId: partida.comprobanteId ?? '',
          orden: partida.orden ?? 0,
          fecha,
          importe,
          registradoPorBancoEl: cerradaEl ?? null,
          anteriorAlArranque: true,
        });
        continue;
      }

      const movimientoId = partida.movimientoBancarioId ?? '';
      if (partida.origen === 'MOVIMIENTO_IGNORADO') {
        // No se re-evalúa contra los matches: ignorar es una decisión manual y
        // un IGNORADO no tiene contraparte que pueda llegar (REQ-CB-11).
        resultado.ignorados.push({ movimientoId, fecha, importe, anteriorAlArranque: true });
        continue;
      }

      const vinculo = vinculos.get(movimientoId) ?? null;
      const asentadoEl =
        vinculo !== null && vinculo.roto === null && vinculo.lineaActual !== null
          ? FechaContable.fromDbDate(vinculo.lineaActual.fechaContable)
          : null;
      if (asentadoEl !== null && !asentadoEl.isAfter(corte)) continue;
      resultado.pendientes.push({
        movimientoId,
        fecha,
        importe,
        asentadoEl,
        anteriorAlArranque: true,
      });
    }

    return resultado;
  }

  /**
   * Para cada línea de la ventana reclamada por un vínculo VÁLIDO, resuelve la
   * fecha del movimiento bancario que la reclama (`fechaMovimientoVinculado`,
   * REQ-ICB-07 simétrico). Los movimientos fuera de la ventana se hidratan por
   * id — lista ACOTADA a los matches válidos de la ventana.
   */
  private async resolverReclamosDeLineas(
    tenantId: string,
    movs: readonly MovimientoBancario[],
    vinculos: ReadonlyMap<string, VinculoVerificado>,
  ): Promise<Map<string, FechaContable>> {
    const validos = [...vinculos.values()].filter((v) => v.roto === null);

    const fechaPorMovimiento = new Map<string, Date>();
    for (const mov of movs) {
      fechaPorMovimiento.set(mov.id, mov.fecha);
    }
    const faltantes = validos
      .map((v) => v.match.movimientoBancarioId)
      .filter((id) => !fechaPorMovimiento.has(id));
    if (faltantes.length > 0) {
      const hidratados = await this.movimientos.listarPorIds(tenantId, faltantes);
      for (const mov of hidratados) {
        fechaPorMovimiento.set(mov.id, mov.fecha);
      }
    }

    const reclamos = new Map<string, FechaContable>();
    for (const v of validos) {
      const fechaMov = fechaPorMovimiento.get(v.match.movimientoBancarioId);
      // Sin el movimiento (inconsistencia que la FK hace imposible) no se
      // afirma el reclamo: la línea queda EN_TRANSITO, el estado honesto.
      if (fechaMov === undefined) continue;
      reclamos.set(
        claveAncla(v.match.comprobanteId, v.match.orden),
        FechaContable.fromDbDate(fechaMov),
      );
    }
    return reclamos;
  }

  private exigirMonedaSoportada(cuentaBancaria: CuentaBancaria): void {
    if (cuentaBancaria.moneda !== 'BOB') {
      throw new ConciliacionMonedaNoSoportadaError(cuentaBancaria.id, cuentaBancaria.moneda);
    }
  }
}

// ============================================================
// Mapeos de boundary → insumos del dominio
// ============================================================

/**
 * Saldo publicado para UNA cuenta dentro del resultado de `saldosVigentes`:
 * `null` honesto si la cuenta no tiene fila (sin movimientos ≤ fecha) o si el
 * último movimiento no publica saldo (REQ-VMB-09).
 */
function saldoDeCuenta(saldos: readonly SaldoVigenteRow[], cuentaBancariaId: string): Money | null {
  const fila = saldos.find((s) => s.cuentaBancariaId === cuentaBancariaId);
  return fila === undefined || fila.saldo === null ? null : Money.of(fila.saldo);
}

/** Fila persistida → view de dominio del acto declarado (Money/FechaContable). */
function aArranqueAplicadoView(
  row: ArranqueConciliado,
  declaradoPorNombre: string | null = null,
  anuladoPorNombre: string | null = null,
): ArranqueAplicadoView {
  return {
    id: row.id,
    fecha: FechaContable.fromDbDate(row.fecha),
    saldoExtracto: Money.of(row.saldoExtracto),
    saldoLibros: Money.of(row.saldoLibros),
    diferenciaResidual: Money.of(row.diferenciaResidual),
    nota: row.nota,
    declaradoPorUserId: row.declaradoPorUserId,
    declaradoPorNombre,
    declaradoEl: row.createdAt,
    anulado: row.anulado,
    motivoAnulacion: row.motivoAnulacion,
    anuladoPorUserId: row.anuladoPorUserId,
    anuladoPorNombre,
    anuladoEl: row.fechaAnulacion,
  };
}

function aCuentaView(cuentaBancaria: CuentaBancaria): CuentaBancariaInformeView {
  return {
    id: cuentaBancaria.id,
    alias: cuentaBancaria.alias,
    cuentaId: cuentaBancaria.cuentaId,
    moneda: cuentaBancaria.moneda,
    numeroCuenta: cuentaBancaria.numeroCuenta,
  };
}

function aMovimientoParaInforme(
  mov: MovimientoBancario,
  vinculo: VinculoVerificado | null,
): MovimientoParaInforme {
  const estadoEfectivo = derivarEstadoEfectivoMovimiento(
    mov.estado,
    vinculo === null ? null : { roto: vinculo.roto },
  );
  const base = {
    id: mov.id,
    fecha: FechaContable.fromDbDate(mov.fecha),
    monto: Money.of(mov.monto),
    tipo: mov.tipo,
  };
  if (estadoEfectivo === 'CONCILIADO') {
    // CONCILIADO ⇒ vínculo válido ⇒ la línea actual existe y verificó contra
    // el snapshot: su `fechaContable` es la fecha del asiento (REQ-ICB-07).
    if (vinculo === null || vinculo.lineaActual === null) {
      throw new Error(`Informe: movimiento ${mov.id} CONCILIADO sin línea verificada`);
    }
    return {
      ...base,
      estadoEfectivo,
      fechaAsientoVinculado: FechaContable.fromDbDate(vinculo.lineaActual.fechaContable),
    };
  }
  return { ...base, estadoEfectivo };
}

function aLineaParaInforme(
  fila: LineaCuentaRow,
  reclamos: ReadonlyMap<string, FechaContable>,
): LineaParaInforme {
  const { tipo, monto } = ladoYMonto(fila);
  const fechaMovimientoVinculado = reclamos.get(claveAncla(fila.comprobanteId, fila.orden)) ?? null;
  const estadoEfectivo = derivarEstadoEfectivoLinea(fechaMovimientoVinculado !== null);
  const base = {
    comprobanteId: fila.comprobanteId,
    orden: fila.orden,
    fecha: FechaContable.fromDbDate(fila.fechaContable),
    monto,
    tipo,
  };
  return estadoEfectivo === 'CONCILIADO' && fechaMovimientoVinculado !== null
    ? { ...base, estadoEfectivo, fechaMovimientoVinculado }
    : { ...base, estadoEfectivo: 'EN_TRANSITO' };
}

// ============================================================
// Confiabilidad (task 3.7, REQ-ICB-05/06/08, D6)
// ============================================================

interface ParamsConfiabilidad {
  corte: FechaContable;
  /** `null` ⇔ sin arranque declarado. */
  arranqueFecha: FechaContable | null;
  /**
   * Contraste del arranque vigente: el `saldoExtracto` DECLARADO vs el saldo
   * REAL del extracto a la fecha del arranque. `null` sin arranque; `real`
   * `null` cuando no hay saldo publicado a esa fecha — sin dato no hay
   * veredicto (misma regla que `SIN_SALDO_EXTRACTO`).
   */
  arranqueExtracto: { declarado: Money; real: Money | null } | null;
  /**
   * Contraste del lado LIBROS: el `saldoLibros` declarado vs el agregado real
   * del mayor a la fecha del arranque. `null` sin arranque. `real` NUNCA es
   * nulo — el agregado devuelve cero sin líneas, y ese cero es información.
   */
  arranqueLibros: { declarado: Money; real: Money } | null;
  saldoExtracto: Money | null;
  residuo: Money | null;
  cobertura: readonly CoberturaImportacionRow[];
}

/**
 * Deriva la sección `confiabilidad` + la trazabilidad de insumos. La señal es
 * RELATIVA al rango del informe: lo TOTALMENTE anterior al arranque está
 * absorbido en los saldos declarados y no retiene la conclusión — pero un
 * hueco o una discontinuidad que toque la ventana sí, aunque nazca antes.
 * Por eso huecos y discontinuidades se detectan sobre la serie COMPLETA
 * (REQ-CB-09/23: son propiedades del conjunto) y recién después se filtran
 * al rango.
 */
function derivarConfiabilidad(p: ParamsConfiabilidad): {
  confiabilidad: ConfiabilidadInforme;
  insumos: { importaciones: ImportacionInsumoView[] };
} {
  const enRango = (desde: FechaContable, hasta: FechaContable): boolean =>
    !desde.isAfter(p.corte) && (p.arranqueFecha === null || hasta.isAfter(p.arranqueFecha));

  const filas = p.cobertura.map((f) => ({
    id: f.id,
    desde: FechaContable.fromDbDate(f.fechaDesde),
    hasta: FechaContable.fromDbDate(f.fechaHasta),
    saldoInicial: f.saldoInicial === null ? null : Money.of(f.saldoInicial),
    saldoFinal: f.saldoFinal === null ? null : Money.of(f.saldoFinal),
    estadoVerificacion: f.estadoVerificacion,
  }));
  const relevantes = filas.filter((f) => enRango(f.desde, f.hasta));
  const desdePorId = new Map(filas.map((f) => [f.id, f.desde]));

  const motivos: MotivoNoConciliado[] = [];
  if (p.arranqueFecha === null) motivos.push({ tipo: 'SIN_ARRANQUE' });
  if (p.saldoExtracto === null) motivos.push({ tipo: 'SIN_SALDO_EXTRACTO' });

  // El punto de partida DECLARADO debe coincidir con el extracto real a su
  // fecha (misma tolerancia que la continuidad entre extractos). Es un
  // contraste INDEPENDIENTE del residuo: un residual declarado "correcto"
  // puede cerrar la identidad en 0.00 con un saldo declarado basura — este
  // motivo existe precisamente para ese caso. Sin saldo real (`null`) no se
  // emite: un null nunca genera una acusación.
  if (
    p.arranqueFecha !== null &&
    p.arranqueExtracto !== null &&
    p.arranqueExtracto.real !== null &&
    !p.arranqueExtracto.declarado.igualaConTolerancia(p.arranqueExtracto.real)
  ) {
    motivos.push({
      tipo: 'ARRANQUE_EXTRACTO_NO_COINCIDE',
      fecha: p.arranqueFecha,
      declarado: p.arranqueExtracto.declarado,
      real: p.arranqueExtracto.real,
      diferencia: p.arranqueExtracto.declarado.minus(p.arranqueExtracto.real).abs(),
    });
  }

  // Simétrico sobre el lado libros. No hay caso `null`: el mayor siempre
  // agrega — sin líneas da cero, y un cero contra un saldo declarado de
  // Bs 1.000 es exactamente la organización que nunca cargó su asiento de
  // apertura. Nombrarlo vale más que callarlo.
  if (
    p.arranqueFecha !== null &&
    p.arranqueLibros !== null &&
    !p.arranqueLibros.declarado.igualaConTolerancia(p.arranqueLibros.real)
  ) {
    motivos.push({
      tipo: 'ARRANQUE_LIBROS_NO_COINCIDE',
      fecha: p.arranqueFecha,
      declarado: p.arranqueLibros.declarado,
      real: p.arranqueLibros.real,
      diferencia: p.arranqueLibros.declarado.minus(p.arranqueLibros.real).abs(),
    });
  }

  for (const f of relevantes) {
    if (f.estadoVerificacion === 'DESCUADRE') {
      motivos.push({ tipo: 'DESCUADRE', importacionId: f.id });
    }
  }

  for (const hueco of detectarHuecos(filas)) {
    if (enRango(hueco.desde, hueco.hasta)) {
      motivos.push({ tipo: 'HUECO', desde: hueco.desde, hasta: hueco.hasta });
    }
  }

  // Los BORDES de la ventana (§3.7). Sin arranque no hay ventana que evaluar y
  // `SIN_ARRANQUE` ya retuvo la conclusión: emitir además un hueco sería
  // acusar de falta de cobertura a quien todavía no declaró desde dónde mirar.
  if (p.arranqueFecha !== null) {
    const bordes = detectarHuecosDeBorde(filas, {
      desde: p.arranqueFecha.sumarDias(1),
      hasta: p.corte,
    });
    if (bordes.inicial !== null) {
      motivos.push({
        tipo: 'HUECO_INICIAL',
        desde: bordes.inicial.desde,
        hasta: bordes.inicial.hasta,
      });
    }
    if (bordes.final !== null) {
      motivos.push({ tipo: 'HUECO_FINAL', desde: bordes.final.desde, hasta: bordes.final.hasta });
    }
  }

  for (const d of detectarDiscontinuidades(filas)) {
    // El salto vive en la juntura: el día en que arranca la importación
    // siguiente. Relevante si esa juntura cae dentro del rango del informe.
    const juntura = desdePorId.get(d.siguienteId);
    if (juntura !== undefined && enRango(juntura, juntura)) {
      motivos.push({
        tipo: 'DISCONTINUIDAD',
        anteriorId: d.anteriorId,
        siguienteId: d.siguienteId,
        diferencia: d.diferencia,
      });
    }
  }

  // REQ-ICB-06: "conciliado" exige residuo CERO EXACTO — hasta el polvo de
  // Bs 0.01 de un match tolerado se nombra en vez de absorberse.
  if (p.residuo !== null && !p.residuo.isZero()) {
    motivos.push({ tipo: 'RESIDUO_NO_EXPLICADO', importe: p.residuo });
  }

  return {
    confiabilidad: { conciliado: motivos.length === 0, motivos },
    insumos: {
      importaciones: relevantes.map((f) => ({
        id: f.id,
        fechaDesde: f.desde,
        fechaHasta: f.hasta,
        estadoVerificacion: f.estadoVerificacion,
      })),
    },
  };
}
