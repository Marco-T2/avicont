// Puerto del repositorio de `ArranqueConciliado` (REQ-ICB-04, design D3/D8).
// Multi-tenancy defense in depth (CLAUDE.md §4.2): toda query filtra por
// tenantId.
//
// El arranque es un ACTO append-only: se declara, jamás se edita ni se borra.
// La única mutación es ANULAR, y no borra nada — marca (§4.7): el acto se
// conserva y sigue visible en el historial.
//
// Por qué hizo falta: "corregir declarando otra" solo funciona si el error NO
// fue la fecha. Declarada una al 31/12 por error, ninguna anterior puede
// ganarle a `vigenteA`, y la cuenta se queda con un punto de partida falso
// para siempre.

import type {
  ArranqueConciliado,
  ArranquePartidaAbierta,
  OrigenPartidaArranque,
  Prisma,
} from '@prisma/client';

export const ARRANQUE_CONCILIADO_REPOSITORY_PORT = Symbol('ARRANQUE_CONCILIADO_REPOSITORY_PORT');

export interface ArranqueConciliadoCreateData {
  cuentaBancariaId: string;
  /** Corte del arranque — `@db.Date`, calendario puro (§4.6). */
  fecha: Date;
  saldoExtracto: Prisma.Decimal;
  saldoLibros: Prisma.Decimal;
  /** Diferencia ACEPTADA al declarar. Se exhibe como partida nombrada (REQ-ICB-04/06). */
  diferenciaResidual: Prisma.Decimal;
  nota: string | null;
  declaradoPorUserId: string;
  /**
   * Partidas que ya estaban ABIERTAS a `fecha`, congeladas junto al acto.
   *
   * Son parte de la declaración, no un cálculo posterior: se persisten en la
   * MISMA transacción que el arranque. Un arranque con la lista a medias
   * produciría informes que cierran de mentira, así que o entran las dos
   * cosas o no entra ninguna.
   */
  partidasAbiertas: readonly PartidaAbiertaCreateData[];
}

export interface PartidaAbiertaCreateData {
  origen: OrigenPartidaArranque;
  /** Presente ⇔ `origen` empieza con `MOVIMIENTO_`. */
  movimientoBancarioId: string | null;
  /** Presentes ⇔ `origen` es `LINEA`. */
  comprobanteId: string | null;
  orden: number | null;
  fecha: Date;
  /** Contribución FIRMADA extracto→libros, ya calculada. */
  importe: Prisma.Decimal;
}

export abstract class ArranqueConciliadoRepositoryPort {
  /**
   * Registra una declaración de arranque. Append-only: NUNCA pisa una
   * anterior — ni siquiera sobre la misma fecha (D8, sin UNIQUE en BD a
   * propósito). El caller pre-valida (cuenta del tenant, moneda BOB); acá
   * solo se persiste el acto atribuido.
   */
  abstract crear(
    tenantId: string,
    data: ArranqueConciliadoCreateData,
    tx?: Prisma.TransactionClient,
  ): Promise<ArranqueConciliado>;

  /**
   * La declaración que APLICA a un corte: la más reciente con
   * `fecha <= corte`, desempatada por `fecha DESC, createdAt DESC` (D8 —
   * ante dos declaraciones sobre la misma fecha gana la última declarada).
   * Es la consulta central del informe: fija la ventana
   * `arranque.fecha < fecha <= corte` y el residuo de partida (D3).
   * `null` si ninguna declaración aplica ⇒ el informe se emite abstenido.
   */
  abstract vigenteA(
    tenantId: string,
    cuentaBancariaId: string,
    corte: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<ArranqueConciliado | null>;

  /**
   * Historial COMPLETO de declaraciones de una cuenta bancaria, orden
   * `fecha DESC, createdAt DESC` (el mismo desempate que `vigenteA`, para
   * que la UI señale cuál aplica sin re-ordenar). Sin paginar a propósito:
   * es un registro de actos puntuales, no un listado masivo, y REQ-ICB-04
   * exige mostrarlo entero — la declaración anterior nunca se oculta.
   */
  abstract listarHistorial(
    tenantId: string,
    cuentaBancariaId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ArranqueConciliado[]>;

  /**
   * Las partidas congeladas de UNA declaración. Que sigan abiertas AL CORTE
   * lo decide el caller contra los matches actuales: acá solo se devuelve lo
   * que se declaró, sin interpretarlo.
   */
  /**
   * Marca una declaración como ANULADA (§4.7: flag, nunca DELETE). Deja de
   * aplicar en `vigenteA` y sigue apareciendo en el historial con su marca,
   * su motivo y su autor.
   *
   * Devuelve `null` si la declaración no existe, es de otro tenant o YA estaba
   * anulada — el caller decide si eso es 404 o conflicto. Anular es idempotente
   * en el dato pero NO en la auditoría: re-anular pisaría el motivo y el autor
   * originales, así que se rechaza.
   */
  abstract anular(
    tenantId: string,
    arranqueId: string,
    data: { motivo: string; anuladoPorUserId: string; fechaAnulacion: Date },
    tx?: Prisma.TransactionClient,
  ): Promise<ArranqueConciliado | null>;

  abstract listarPartidasAbiertas(
    tenantId: string,
    arranqueId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ArranquePartidaAbierta[]>;
}
