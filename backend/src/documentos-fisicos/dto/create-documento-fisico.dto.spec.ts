import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateDocumentoFisicoDto } from './create-documento-fisico.dto';

// spec REQ-D-01 / escenario E-D-07: el monto, cuando se provee, debe ser > 0.
// La validación vive en el DTO (400 antes de tocar el service).
describe('CreateDocumentoFisicoDto — validación de monto positivo', () => {
  const base = {
    tipoDocumentoFisicoId: '11111111-1111-4111-a111-111111111111',
    numero: 'FC-0001',
    fechaEmision: '2026-04-22',
  };

  async function erroresDeMonto(payload: Record<string, unknown>): Promise<boolean> {
    const dto = plainToInstance(CreateDocumentoFisicoDto, payload);
    const errores = await validate(dto);
    return errores.some((e) => e.property === 'monto');
  }

  it('rechaza monto "0.00"', async () => {
    expect(await erroresDeMonto({ ...base, monto: '0.00' })).toBe(true);
  });

  it('rechaza monto "0"', async () => {
    expect(await erroresDeMonto({ ...base, monto: '0' })).toBe(true);
  });

  it('rechaza monto negativo "-5.00"', async () => {
    expect(await erroresDeMonto({ ...base, monto: '-5.00' })).toBe(true);
  });

  it('acepta monto "1250.50"', async () => {
    expect(await erroresDeMonto({ ...base, monto: '1250.50' })).toBe(false);
  });

  it('acepta monto "0.01" (positivo pequeño)', async () => {
    expect(await erroresDeMonto({ ...base, monto: '0.01' })).toBe(false);
  });

  it('acepta monto ausente (opcional para no-tributarios)', async () => {
    expect(await erroresDeMonto({ ...base })).toBe(false);
  });
});
