import { CreateCobroDto } from './create-cobro.dto';

/**
 * La edición es full-state (mismo criterio D-17 que la venta): el MISMO shape
 * del alta, sin campos parciales — el reemplazo en bloque ES el mecanismo,
 * incluido cambiar el `contactoId` (matriz fila 12, que desvincula TODAS las
 * aplicaciones con rastro B-14). Por eso extiende sin agregar nada y el verbo
 * HTTP es PUT.
 */
export class UpdateCobroDto extends CreateCobroDto {}
