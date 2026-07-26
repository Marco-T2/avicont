// Historial de arranques (REQ-ICB-04, design D8): la UI debe mostrar el
// historial COMPLETO de declaraciones y señalar cuál aplica. El servicio solo
// resuelve la cuenta (404 cross-tenant) y mapea al view de dominio — el orden
// `fecha DESC, createdAt DESC` viene del repo, el MISMO desempate que
// `vigenteA`, para que el frontend señale la vigente sin re-ordenar.
//
// Archivo separado del spec de `obtenerInforme` a propósito: la suite
// preexistente queda intacta.

import type { ArranqueConciliado, CuentaBancaria } from '@prisma/client';
import { Prisma } from '@prisma/client';

import type { LineasCuentaReaderPort } from '@/comprobantes/ports/lineas-cuenta-reader.port';

import type { CuentasBancariasService } from './cuentas-bancarias.service';
import { InformeConciliacionService } from './informe-conciliacion.service';
import type { ArranqueConciliadoRepositoryPort } from './ports/arranque-conciliado.repository.port';
import type { ImportacionExtractoRepositoryPort } from './ports/importacion-extracto.repository.port';
import type { MatchConciliacionRepositoryPort } from './ports/match-conciliacion.repository.port';
import type { MovimientoBancarioRepositoryPort } from './ports/movimiento-bancario.repository.port';
import type { UsuarioReaderPort } from '@/users/ports/usuario-reader.port';

const TENANT = 'tenant-1';
const CB_ID = 'cb-1';

function cuentaBancariaRow(overrides: Partial<CuentaBancaria> = {}): CuentaBancaria {
  return {
    id: CB_ID,
    organizationId: TENANT,
    cuentaId: 'cta-banco',
    alias: 'BancoSol corriente',
    perfilExtracto: 'BANCOSOL_XLSX',
    numeroCuenta: null,
    moneda: 'BOB',
    activa: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as CuentaBancaria;
}

function arranqueRow(overrides: Partial<ArranqueConciliado> = {}): ArranqueConciliado {
  return {
    id: 'arr-1',
    organizationId: TENANT,
    cuentaBancariaId: CB_ID,
    fecha: new Date('2026-06-30T00:00:00.000Z'),
    saldoExtracto: new Prisma.Decimal('1000.00'),
    saldoLibros: new Prisma.Decimal('990.00'),
    diferenciaResidual: new Prisma.Decimal('10.00'),
    nota: null,
    declaradoPorUserId: 'user-1',
    createdAt: new Date('2026-07-01T12:00:00.000Z'),
    ...overrides,
  } as ArranqueConciliado;
}

describe('InformeConciliacionService.listarHistorial (REQ-ICB-04, D8)', () => {
  let cuentasBancarias: { findById: jest.Mock };
  let arranques: {
    vigenteA: jest.Mock;
    crear: jest.Mock;
    listarHistorial: jest.Mock;
    listarPartidasAbiertas: jest.Mock;
    anular: jest.Mock;
  };
  let usuarios: { listarPorIds: jest.Mock };
  let service: InformeConciliacionService;

  beforeEach(() => {
    cuentasBancarias = { findById: jest.fn().mockResolvedValue(cuentaBancariaRow()) };
    arranques = {
      vigenteA: jest.fn(),
      crear: jest.fn(),
      listarHistorial: jest.fn().mockResolvedValue([]),
      // Sin partidas congeladas por defecto: el caso de un arranque declarado
      // sobre una cuenta sin nada abierto antes.
      listarPartidasAbiertas: jest.fn().mockResolvedValue([]),
      anular: jest.fn(),
    };
    // Los demás ports no participan del historial: stubs vacíos.
    usuarios = {
      listarPorIds: jest
        .fn()
        .mockResolvedValue([
          { id: 'user-1', displayName: 'Marco Tarqui', email: 'marco@avicont.bo' },
        ]),
    };

    service = new InformeConciliacionService(
      cuentasBancarias as unknown as CuentasBancariasService,
      arranques as unknown as ArranqueConciliadoRepositoryPort,
      {} as unknown as MovimientoBancarioRepositoryPort,
      {} as unknown as MatchConciliacionRepositoryPort,
      {} as unknown as LineasCuentaReaderPort,
      {} as unknown as ImportacionExtractoRepositoryPort,
      usuarios as unknown as UsuarioReaderPort,
    );
  });

  it('resuelve la cuenta por tenant ANTES de listar: cuenta ajena ⇒ propaga el 404 sin tocar el repo', async () => {
    const notFound = new Error('CUENTA_BANCARIA_NOT_FOUND');
    cuentasBancarias.findById.mockRejectedValue(notFound);

    await expect(service.listarHistorial(TENANT, 'cb-ajena')).rejects.toThrow(notFound);

    expect(cuentasBancarias.findById).toHaveBeenCalledWith(TENANT, 'cb-ajena');
    expect(arranques.listarHistorial).not.toHaveBeenCalled();
  });

  it('mapea cada fila al view de dominio preservando el orden del repo (fecha DESC, createdAt DESC)', async () => {
    arranques.listarHistorial.mockResolvedValue([
      arranqueRow({
        id: 'arr-2',
        fecha: new Date('2026-07-31T00:00:00.000Z'),
        saldoExtracto: new Prisma.Decimal('2000.00'),
        saldoLibros: new Prisma.Decimal('2000.00'),
        diferenciaResidual: new Prisma.Decimal('0.00'),
        nota: 'corte de julio',
        createdAt: new Date('2026-08-01T09:00:00.000Z'),
      }),
      arranqueRow({ id: 'arr-1' }),
    ]);

    const historial = await service.listarHistorial(TENANT, CB_ID);

    expect(arranques.listarHistorial).toHaveBeenCalledWith(TENANT, CB_ID);
    expect(historial.map((a) => a.id)).toEqual(['arr-2', 'arr-1']);

    const [reciente, anterior] = historial;
    expect(reciente!.fecha.toIso()).toBe('2026-07-31');
    expect(reciente!.saldoExtracto.toBob()).toBe('2000.00');
    expect(reciente!.saldoLibros.toBob()).toBe('2000.00');
    expect(reciente!.diferenciaResidual.toBob()).toBe('0.00');
    expect(reciente!.nota).toBe('corte de julio');
    expect(reciente!.declaradoPorUserId).toBe('user-1');
    expect(reciente!.declaradoEl.toISOString()).toBe('2026-08-01T09:00:00.000Z');

    expect(anterior!.fecha.toIso()).toBe('2026-06-30');
    expect(anterior!.diferenciaResidual.toBob()).toBe('10.00');
  });

  it('sin declaraciones devuelve lista vacía (no es un error: la cuenta existe y nadie declaró)', async () => {
    await expect(service.listarHistorial(TENANT, CB_ID)).resolves.toEqual([]);
  });

  it('cuenta no-BOB: el historial se lista igual — mirar es lectura pura, no exige moneda soportada', async () => {
    // A diferencia del informe (que calcula la identidad y rechaza no-BOB),
    // listar actos ya declarados no computa nada: no hay razón para retenerlo.
    cuentasBancarias.findById.mockResolvedValue(cuentaBancariaRow({ moneda: 'USD' }));

    await expect(service.listarHistorial(TENANT, CB_ID)).resolves.toEqual([]);
    expect(arranques.listarHistorial).toHaveBeenCalledWith(TENANT, CB_ID);
  });
});
