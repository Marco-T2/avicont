import { CreateVentaDto } from './create-venta.dto';

/**
 * La edición es full-state (D-17): el MISMO shape del alta, sin campos
 * parciales — el reemplazo en bloque ES el mecanismo, incluido cambiar el
 * contacto (D-20). Por eso extiende sin agregar nada y el verbo HTTP es PUT.
 */
export class UpdateVentaDto extends CreateVentaDto {}
