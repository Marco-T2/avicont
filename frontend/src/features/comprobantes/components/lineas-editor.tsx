import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { AlertTriangle, Plus } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Cuenta } from '@/types/api';

import { calcularTotalesLineas } from '../lib/calcular-totales';
import type { ComprobanteMode, LineaFormValues } from '../types';
import { LINEA_VACIA } from '../types';
import { LineaRow } from './linea-row';

interface LineasEditorProps {
  mode: ComprobanteMode;
  cuentas: Cuenta[];
}

/**
 * Editor de líneas contables con useFieldArray.
 * Se integra con el FormProvider del padre — NO recibe value/onChange.
 *
 * Comportamiento por mode:
 * - 'nuevo' / 'borrador': editor completamente habilitado.
 * - 'contabilizado': arranca disabled + WarningBanner + toggle "Reemplazar líneas".
 *   Cuando toggle está off, las líneas NO se envían en el submit (el padre
 *   lo decide leyendo formState.isDirty en el campo lineas).
 *
 * Keyboard shortcuts:
 * - Enter en último input de última fila → nueva fila + foco al primer input.
 * - Alt+Delete con foco en botón eliminar → eliminar la fila correspondiente.
 * - Enter global del form DESHABILITADO dentro del editor (onKeyDown capture).
 */
export function LineasEditor({ mode, cuentas }: LineasEditorProps): React.JSX.Element {
  const { control } = useFormContext();

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'lineas',
  });

  // Toggle para habilitar edición en mode='contabilizado'
  const [reemplazarLineas, setReemplazarLineas] = useState(false);

  const editorDisabled = mode === 'contabilizado' && !reemplazarLineas;

  // PointerSensor (no native HTML5 DnD) convive con los inputs editables;
  // KeyboardSensor da a11y de reorden por teclado (design §Decisión 6).
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // El front solo reordena el array; el backend re-deriva `orden = idx + 1` en el
  // re-insert §4.3. `move()` reordena el fieldArray sin estado paralelo (design §Decisión 4).
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over === null || active.id === over.id) return;
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      // noUncheckedIndexedAccess / contrato de move: ambos índices deben existir.
      if (oldIndex === -1 || newIndex === -1) return;
      move(oldIndex, newIndex);
    },
    [fields, move],
  );

  // Ref al contenedor para capturar eventos keyboard
  const containerRef = useRef<HTMLDivElement>(null);

  const agregarLinea = useCallback(() => {
    append({ ...LINEA_VACIA, _localKey: crypto.randomUUID() });
  }, [append]);

  // Keyboard handler: Enter en último input de última fila → nueva fila.
  // Alt+Delete → elimina la fila con foco.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Bloquear Enter global para prevenir submit accidental dentro del editor
      if (e.key === 'Enter' && !e.altKey) {
        const target = e.target as HTMLElement;
        // Si el target es un botón, permitir que active el click
        if (target.tagName === 'BUTTON') return;
        e.preventDefault();
        // Si el foco está en el último input de la última fila, agregar fila
        const container = containerRef.current;
        if (container == null) return;
        const inputs = Array.from(container.querySelectorAll('input:not([readonly]):not(:disabled)'));
        const lastInput = inputs[inputs.length - 1];
        if (lastInput === target && !editorDisabled) {
          agregarLinea();
        }
        return;
      }

      // Alt+Delete → eliminar la fila que tiene el foco
      if (e.key === 'Delete' && e.altKey) {
        e.preventDefault();
        if (editorDisabled || fields.length <= 1) return;
        const target = e.target as HTMLElement;
        const container = containerRef.current;
        if (container == null) return;
        // Encontrar el tr padre del elemento con foco
        const tr = target.closest('tr');
        if (tr == null) return;
        const rows = Array.from(container.querySelectorAll('tr[data-row-index]'));
        const rowIndex = rows.findIndex((r) => r === tr);
        if (rowIndex !== -1) {
          remove(rowIndex);
        }
      }
    },
    [agregarLinea, editorDisabled, fields.length, remove],
  );

  // Leer debitoBob/creditoBob de todas las líneas para el footer
  const lineasWatch = useWatch({ control, name: 'lineas' }) as LineaFormValues[] | undefined;
  const lineas = lineasWatch ?? [];

  const totales = calcularTotalesLineas(lineas);

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className="w-full"
    >
      {/* WarningBanner — solo en mode contabilizado */}
      {mode === 'contabilizado' && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 mb-3 text-amber-700 dark:text-amber-400 text-sm"
        >
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Comprobante contabilizado</p>
            <p className="mt-0.5 text-xs opacity-90">
              Los cambios en las líneas quedan registrados en auditoría.
            </p>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              role="checkbox"
              aria-label="Reemplazar líneas"
              checked={reemplazarLineas}
              onChange={(e) => setReemplazarLineas(e.target.checked)}
              className="accent-amber-600"
            />
            <span className="text-xs font-medium">Reemplazar líneas</span>
          </label>
        </div>
      )}

      {/* Tabla de líneas */}
      <div className="overflow-x-auto rounded-md border border-border">
        {/* table-fixed + colgroup: las proporciones de cada columna son
            predecibles y NO dependen del contenido (un nombre de cuenta largo
            ya no desbalancea la fila — se trunca). min-w-[800px] = piso: por
            debajo de ese ancho el contenedor scrollea en vez de aplastar las
            columnas (CLAUDE.md §7 — tablas con muchas columnas / mobile-usable). */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        >
          <table className="w-full min-w-[800px] table-fixed text-sm">
            <colgroup>
              <col className="w-[32px]" /> {/* Handle de arrastre — fijo, solo el ícono */}
              <col className="w-[22%]" /> {/* Cuenta */}
              <col className="w-[11%]" /> {/* Debe */}
              <col className="w-[11%]" /> {/* Haber */}
              <col className="w-[40%]" /> {/* Glosa línea — la más ancha */}
              <col className="w-[16%]" /> {/* Contacto */}
              <col className="w-[44px]" /> {/* Eliminar — fijo, solo el ícono */}
            </colgroup>
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="p-2" aria-label="Reordenar" />
                <th className="p-2 text-left font-medium">Cuenta</th>
                {/* Moneda y T.C. ocultos — la UI lockea BOB/1; columnas eliminadas de spec §5.7.
                    Debe/Haber YA están en BOB (TC=1); las columnas espejo "Debe/Haber BOB"
                    se eliminaron por redundantes. El montoBob se recalcula en el submit
                    (poblarBobEnLineas). */}
                <th className="p-2 text-right font-medium">Debe</th>
                <th className="p-2 text-right font-medium">Haber</th>
                <th className="p-2 text-left font-medium">Glosa línea</th>
                <th className="p-2 text-left font-medium">Contacto</th>
                <th className="p-2" />
              </tr>
            </thead>
            <SortableContext
              items={fields.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <tbody>
                {fields.map((field, i) => {
                  // noUncheckedIndexedAccess: narrowing obligatorio antes de operar.
                  if (field === undefined) return null;
                  return (
                    <LineaRow
                      key={field.id}
                      id={field.id}
                      index={i}
                      cuentas={cuentas}
                      onRemove={() => remove(i)}
                      isOnlyRow={fields.length === 1}
                      disabled={editorDisabled}
                      data-row-index={i}
                      data-field-id={field.id}
                    />
                  );
                })}
              </tbody>
            </SortableContext>
          </table>
        </DndContext>
      </div>

      {/* Botón agregar */}
      <div className="mt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={agregarLinea}
          disabled={editorDisabled}
          className="gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar línea
        </Button>
      </div>

      {/* Footer con totales */}
      <div className="mt-3 flex items-center justify-end gap-6 text-sm border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Total Debe</span>
          <span className="font-mono font-medium tabular-nums">
            {totales.totalDebitoBob.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Total Haber</span>
          <span className="font-mono font-medium tabular-nums">
            {totales.totalCreditoBob.toFixed(2)}
          </span>
        </div>
        {totales.estaBalanceado ? (
          <Badge
            variant="outline"
            className="text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900"
          >
            Balanceado
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="text-destructive border-destructive/40 bg-destructive/10"
          >
            Desbalanceado
          </Badge>
        )}
      </div>
    </div>
  );
}
