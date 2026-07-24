import { ApiPropertyOptional } from '@nestjs/swagger';
import { Moneda } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * PATCH de la cuenta bancaria. Todos los campos opcionales.
 *
 * `cuentaId` y `perfilExtracto` NO van acá — son inmutables post-creación
 * (decisión 10: "una cuenta bancaria = un perfil de formato"; el vínculo a
 * la cuenta del plan es la identidad de REQ-CB-01).
 */
export class UpdateCuentaBancariaDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  alias?: string;

  // numeroCuenta es nullable: `null` explícito limpia el valor capturado
  // (ej. si se cargó mal a mano). El @ValidateIf permite null sin que
  // @IsString lo rechace — mismo patrón que actividadFlujo en cuentas/.
  @ApiPropertyOptional({
    example: '1191959-000-001',
    maxLength: 50,
    nullable: true,
    description: 'null limpia el número capturado; se vuelve a capturar en la próxima importación.',
  })
  @IsOptional()
  @ValidateIf((o: UpdateCuentaBancariaDto) => o.numeroCuenta !== null)
  @IsString()
  @MaxLength(50)
  numeroCuenta?: string | null;

  @ApiPropertyOptional({
    enum: Moneda,
    description: 'Re-valida REQ-CB-02 contra la cuenta del plan ya vinculada.',
  })
  @IsOptional()
  @IsEnum(Moneda)
  moneda?: Moneda;

  @ApiPropertyOptional({ description: 'Activar o desactivar la cuenta bancaria sin eliminarla.' })
  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
