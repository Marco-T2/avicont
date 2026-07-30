import { Plus } from 'lucide-react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import { Button } from '@/components/ui/button';

import { calcularTotalPreview } from '../lib/calcular-total-venta';
import type { LineaVentaFormValues } from '../schemas/venta-form-schema';
import { LINEA_VENTA_VACIA } from '../types';
import { LineaVentaRow } from './linea-venta-row';

interface LineasVentaEditorProps {
  disabled?: boolean;
}

/**
 * Editor de líneas de venta con useFieldArray. Se integra con el
 * FormProvider del padre (VentaForm) — no recibe value/onChange.
 *
 * Estrategia de tabla (frontend/CLAUDE.md §7): scroll horizontal con piso
 * `min-w-[760px]` + `table-fixed` — por debajo de ese ancho el contenedor
 * scrollea en vez de aplastar las columnas. Sin drag&drop: el orden de las
 * líneas de una venta no tiene semántica contable (el backend deriva
 * `orden = idx + 1`).
 *
 * El total del footer es un PREVIEW en vivo (REQ-VTA-03): nunca viaja al
 * backend, que recalcula y persiste los totales autoritativos en cada write.
 */
export function LineasVentaEditor({
  disabled = false,
}: LineasVentaEditorProps): React.JSX.Element {
  const { control } = useFormContext();

  const { fields, append, remove } = useFieldArray({ control, name: 'lineas' });

  const lineasWatch = useWatch({ control, name: 'lineas' }) as
    | LineaVentaFormValues[]
    | undefined;
  const totalPreview = calcularTotalPreview(lineasWatch ?? []);

  return (
    <div className="w-full">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[760px] table-fixed text-sm">
          <colgroup>
            <col className="w-[24%]" /* Ítem */ />
            <col className="w-[32%]" /* Descripción — la más ancha */ />
            <col className="w-[13%]" /* Cantidad */ />
            <col className="w-[14%]" /* Precio unitario */ />
            <col className="w-[13%]" /* Subtotal preview */ />
            <col className="w-[44px]" /* Eliminar — fijo, solo el ícono */ />
          </colgroup>
          <thead>
            <tr className="bg-muted/50 text-muted-foreground">
              <th className="p-2 text-left font-medium">Ítem</th>
              <th className="p-2 text-left font-medium">Descripción</th>
              <th className="p-2 text-right font-medium">Cantidad</th>
              <th className="p-2 text-right font-medium">Precio unit.</th>
              <th className="p-2 text-right font-medium">Subtotal</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {fields.map((field, i) => (
              // Anti-F-06: key = field.id de useFieldArray, nunca el índice.
              <LineaVentaRow
                key={field.id}
                index={i}
                onRemove={() => remove(i)}
                isOnlyRow={fields.length === 1}
                disabled={disabled}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ ...LINEA_VENTA_VACIA })}
          disabled={disabled}
          className="gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar línea
        </Button>
      </div>

      {/* Total preview — el backend calcula y persiste el definitivo. */}
      <div className="mt-3 flex flex-col items-end gap-1 border-t border-border pt-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Total</span>
          <span className="font-mono font-medium tabular-nums">
            <span className="text-muted-foreground text-xs mr-0.5">Bs</span>
            {totalPreview}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Vista previa — el total definitivo lo calcula el sistema al guardar.
        </p>
      </div>
    </div>
  );
}
