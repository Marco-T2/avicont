import { PeriodoFiscalStatus } from '@prisma/client';

import { toPeriodoResponse } from './periodo-fiscal-response.dto';

/** Crea un PeriodoFiscal mínimo de Prisma para los tests. */
function makePeriodo(year: number, month: number): Parameters<typeof toPeriodoResponse>[0] {
  return {
    id: 'test-id',
    organizationId: 'org-id',
    gestionId: 'gestion-id',
    year,
    month,
    ordenEnGestion: month,
    status: PeriodoFiscalStatus.ABIERTO,
    esDefinitivo: false,
    closedAt: null,
    closedByUserId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('toPeriodoResponse', () => {
  it('proyecta fechaInicio y fechaFin correctamente para enero 2026', () => {
    const dto = toPeriodoResponse(makePeriodo(2026, 1));
    expect(dto.fechaInicio).toBe('2026-01-01');
    expect(dto.fechaFin).toBe('2026-01-31');
  });

  it('proyecta fechaFin correctamente para abril (30 días)', () => {
    const dto = toPeriodoResponse(makePeriodo(2026, 4));
    expect(dto.fechaInicio).toBe('2026-04-01');
    expect(dto.fechaFin).toBe('2026-04-30');
  });

  it('proyecta fechaFin=2026-02-28 para febrero no bisiesto 2026', () => {
    const dto = toPeriodoResponse(makePeriodo(2026, 2));
    expect(dto.fechaInicio).toBe('2026-02-01');
    expect(dto.fechaFin).toBe('2026-02-28');
  });

  it('proyecta fechaFin=2024-02-29 para febrero bisiesto 2024', () => {
    const dto = toPeriodoResponse(makePeriodo(2024, 2));
    expect(dto.fechaInicio).toBe('2024-02-01');
    expect(dto.fechaFin).toBe('2024-02-29');
  });

  it('proyecta fechaFin correctamente para diciembre', () => {
    const dto = toPeriodoResponse(makePeriodo(2026, 12));
    expect(dto.fechaInicio).toBe('2026-12-01');
    expect(dto.fechaFin).toBe('2026-12-31');
  });

  it('conserva todos los campos existentes del DTO (shape completo)', () => {
    const periodo = makePeriodo(2026, 3);
    const dto = toPeriodoResponse(periodo);

    expect(dto.id).toBe('test-id');
    expect(dto.gestionId).toBe('gestion-id');
    expect(dto.year).toBe(2026);
    expect(dto.month).toBe(3);
    expect(dto.ordenEnGestion).toBe(3);
    expect(dto.status).toBe(PeriodoFiscalStatus.ABIERTO);
    expect(dto.esDefinitivo).toBe(false);
    expect(dto.closedAt).toBeNull();
    expect(dto.closedByUserId).toBeNull();
    expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(dto.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    // Campos nuevos presentes
    expect(dto.fechaInicio).toBeDefined();
    expect(dto.fechaFin).toBeDefined();
  });
});
