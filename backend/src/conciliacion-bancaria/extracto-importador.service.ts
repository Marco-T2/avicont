/**
 * Orquesta la importación de un extracto (design §10, REQ-CB-03/04/05/06/07/
 * 08/13/16). Solo puertos + dominio puro — cero lógica de negocio acá que no
 * esté ya resuelta en `domain/` (slice 2) o en los adapters de este slice.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Moneda, PerfilExtracto } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';

import { PrismaService } from '@/common/prisma.service';

import { detectarFamiliaArchivo } from './adapters/deteccion-archivo';
import { verificarChecksum } from './domain/checksum-extracto';
import { CuentaBancariaNoEncontradaError } from './domain/cuenta-bancaria-errors';
import { calcularHashDedup } from './domain/hash-dedup';
import {
  ArchivoCuentaNoCoincideError,
  ArchivoPerfilNoCoincideError,
  ArchivoSinParserRegistradoError,
  ArchivoXlsLegacyError,
} from './domain/importacion-errors';
import { normalizarDescripcion } from './domain/normalizar-descripcion';
import { NumeroCuentaBancaria } from './domain/numero-cuenta-bancaria';
import type { MovimientoConOrdinalDia } from './domain/ordinal-dia';
import { asignarOrdinalDia } from './domain/ordinal-dia';
import { ordenarCanonico } from './domain/orden-canonico';
import { ExtractoParserLookupService } from './extracto-parser-lookup.service';
import {
  CUENTA_BANCARIA_REPOSITORY_PORT,
  CuentaBancariaRepositoryPort,
} from './ports/cuenta-bancaria.repository.port';
import type { ExtractoParseado } from './ports/extracto-parser.port';
import {
  IMPORTACION_EXTRACTO_REPOSITORY_PORT,
  ImportacionExtractoRepositoryPort,
} from './ports/importacion-extracto.repository.port';
import type { MovimientoBancarioCreateData } from './ports/movimiento-bancario.repository.port';
import {
  MOVIMIENTO_BANCARIO_REPOSITORY_PORT,
  MovimientoBancarioRepositoryPort,
} from './ports/movimiento-bancario.repository.port';

export interface AdvertenciaImportacion {
  readonly codigo: string;
  readonly mensaje: string;
}

export interface ArchivoImportado {
  readonly buffer: Buffer;
  readonly nombreOriginal: string;
  readonly tamanioBytes: number;
}

export interface ResultadoRequiereConfirmacion {
  readonly requiereConfirmacionCuenta: true;
  readonly numeroDetectado: string;
}

export interface ResultadoImportacionCompleta {
  readonly requiereConfirmacionCuenta: false;
  readonly importacionId: string;
  readonly movimientosNuevos: number;
  readonly movimientosDuplicados: number;
  readonly filasLeidas: number;
  readonly estadoVerificacion: string;
  readonly diferencia: string | null;
  readonly advertencias: AdvertenciaImportacion[];
}

export type ResultadoImportacion = ResultadoRequiereConfirmacion | ResultadoImportacionCompleta;

const ADVERTENCIA_CUENTA_NO_VERIFICABLE: AdvertenciaImportacion = {
  codigo: 'CONCILIACION_ARCHIVO_CUENTA_NO_VERIFICABLE',
  mensaje:
    'No se pudo verificar el número de cuenta del archivo contra la cuenta bancaria destino. Revisá manualmente que corresponda a la cuenta correcta.',
};

@Injectable()
export class ExtractoImportadorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parserLookup: ExtractoParserLookupService,
    @Inject(CUENTA_BANCARIA_REPOSITORY_PORT)
    private readonly cuentaBancariaRepo: CuentaBancariaRepositoryPort,
    @Inject(MOVIMIENTO_BANCARIO_REPOSITORY_PORT)
    private readonly movimientoRepo: MovimientoBancarioRepositoryPort,
    @Inject(IMPORTACION_EXTRACTO_REPOSITORY_PORT)
    private readonly importacionRepo: ImportacionExtractoRepositoryPort,
  ) {}

  async importar(
    tenantId: string,
    cuentaBancariaId: string,
    userId: string,
    archivo: ArchivoImportado,
    opts: { confirmarNumeroCuenta: boolean },
  ): Promise<ResultadoImportacion> {
    const cuentaBancaria = await this.cuentaBancariaRepo.findById(tenantId, cuentaBancariaId);
    if (!cuentaBancaria) throw new CuentaBancariaNoEncontradaError(cuentaBancariaId);

    // ══ Compuerta REQ-CB-04 — magic bytes, ANTES de tocar el parser ══
    const familia = await detectarFamiliaArchivo(archivo.buffer);
    if (familia === 'OLE2_LEGACY') {
      throw new ArchivoXlsLegacyError();
    }

    const parser = this.parserLookup.buscar(cuentaBancaria.perfilExtracto);
    if (!parser) {
      throw new ArchivoSinParserRegistradoError(cuentaBancaria.perfilExtracto);
    }

    // ══ Compuerta REQ-CB-03 — perfil/estructura ══
    const reconoce = await parser.reconoce(archivo.buffer);
    if (!reconoce) {
      throw new ArchivoPerfilNoCoincideError(parser.descriptor.perfil);
    }

    const parseado = await parser.parse(archivo.buffer);
    const { descriptor } = parser;

    // ══ Compuerta REQ-CB-16 — número de cuenta declarado vs destino ══
    const advertencias: AdvertenciaImportacion[] = [];
    let numeroCuentaAConfirmar: string | null = null;

    if (descriptor.exponeNumeroCuenta && parseado.numeroCuentaDeclarado !== null) {
      if (cuentaBancaria.numeroCuenta === null) {
        if (!opts.confirmarNumeroCuenta) {
          return {
            requiereConfirmacionCuenta: true,
            numeroDetectado: parseado.numeroCuentaDeclarado,
          };
        }
        numeroCuentaAConfirmar = parseado.numeroCuentaDeclarado;
      } else {
        const declarado = NumeroCuentaBancaria.of(parseado.numeroCuentaDeclarado);
        const destino = NumeroCuentaBancaria.of(cuentaBancaria.numeroCuenta);
        if (!declarado.equals(destino)) {
          throw new ArchivoCuentaNoCoincideError(
            parseado.numeroCuentaDeclarado,
            cuentaBancaria.numeroCuenta,
          );
        }
      }
    } else {
      // exponeNumeroCuenta=false (estructural) O el parser no logró extraerlo
      // de ESTE archivo puntual (REQ-CB-16 escenario 5) — advierte, sigue.
      advertencias.push(ADVERTENCIA_CUENTA_NO_VERIFICABLE);
    }

    // ══ Fin de compuertas de rechazo — de acá en más nada más lanza 422 ══

    const canonico = ordenarCanonico(parseado.movimientos);
    const conOrdinal = asignarOrdinalDia(canonico);
    const filas: MovimientoBancarioCreateData[] = conOrdinal.map((item) =>
      construirMovimientoCreateData(item, cuentaBancariaId, cuentaBancaria.moneda),
    );

    const checksum = verificarChecksum(descriptor.estrategiaChecksum, canonico, {
      saldoInicialDeclarado: parseado.saldoInicialDeclarado,
      saldoFinalDeclarado: parseado.saldoFinalDeclarado,
    });

    const sha256Archivo = createHash('sha256').update(archivo.buffer).digest('hex');
    if (await this.importacionRepo.existePorSha256(tenantId, cuentaBancariaId, sha256Archivo)) {
      advertencias.push({
        codigo: 'CONCILIACION_ARCHIVO_YA_IMPORTADO',
        mensaje: 'Este mismo archivo ya fue importado antes para esta cuenta bancaria.',
      });
    }

    const resultado = await this.prisma.$transaction(async (tx) => {
      if (numeroCuentaAConfirmar !== null) {
        await this.cuentaBancariaRepo.update(
          tenantId,
          cuentaBancariaId,
          { numeroCuenta: numeroCuentaAConfirmar },
          tx,
        );
      }

      const importacion = await this.importacionRepo.crear(
        tenantId,
        {
          cuentaBancariaId,
          nombreArchivo: archivo.nombreOriginal,
          sha256Archivo,
          tamanioBytes: archivo.tamanioBytes,
          perfilExtracto: descriptor.perfil as PerfilExtracto,
          fechaDesde: parseado.cobertura.desde.toDbDate(),
          fechaHasta: parseado.cobertura.hasta.toDbDate(),
          coberturaDeclarada: parseado.cobertura.declarada,
          saldoInicial: parseado.saldoInicialDeclarado?.toPrismaDecimal() ?? null,
          saldoFinal: parseado.saldoFinalDeclarado?.toPrismaDecimal() ?? null,
          estadoVerificacion: checksum.estadoVerificacion,
          diferencia: checksum.diferencia?.toPrismaDecimal() ?? null,
          filasLeidas: parseado.movimientos.length,
          movimientosNuevos: 0,
          movimientosDuplicados: 0,
          importadoPorUserId: userId,
        },
        tx,
      );

      const { insertados } = await this.movimientoRepo.crearMuchos(
        tenantId,
        cuentaBancariaId,
        importacion.id,
        filas,
        tx,
      );
      const duplicados = filas.length - insertados;

      const importacionFinal = await this.importacionRepo.actualizarContadores(
        tenantId,
        importacion.id,
        { movimientosNuevos: insertados, movimientosDuplicados: duplicados },
        tx,
      );

      return { importacionFinal, insertados, duplicados };
    });

    return {
      requiereConfirmacionCuenta: false,
      importacionId: resultado.importacionFinal.id,
      movimientosNuevos: resultado.insertados,
      movimientosDuplicados: resultado.duplicados,
      filasLeidas: parseado.movimientos.length,
      estadoVerificacion: checksum.estadoVerificacion,
      diferencia: checksum.diferencia?.toBob() ?? null,
      advertencias,
    };
  }
}

function construirMovimientoCreateData(
  item: MovimientoConOrdinalDia,
  cuentaBancariaId: string,
  moneda: Moneda,
): MovimientoBancarioCreateData {
  const { movimiento, ordinalDia } = item;
  const hashDedup = calcularHashDedup(cuentaBancariaId, item);
  return {
    fecha: movimiento.fecha.toDbDate(),
    hora: movimiento.hora,
    monto: movimiento.monto.toPrismaDecimal(),
    tipo: movimiento.tipo,
    moneda,
    descripcion: movimiento.descripcion,
    descripcionNormalizada: normalizarDescripcion(movimiento.descripcion),
    referencia: movimiento.referencia,
    saldo: movimiento.saldo?.toPrismaDecimal() ?? null,
    contraparteNombre: movimiento.contraparteNombre,
    contraparteDocumento: movimiento.contraparteDocumento,
    datosOriginales: movimiento.datosOriginales as Prisma.InputJsonValue,
    ordinalDia,
    hashDedup,
  };
}

// Reexportado para que consumidores tipen el resultado sin importar de `ports/extracto-parser.port`.
export type { ExtractoParseado };
