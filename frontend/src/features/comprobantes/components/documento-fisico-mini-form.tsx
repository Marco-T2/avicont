import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
// Cross-feature: buildFormSchema y DEFAULT_CREATE_VALUES de la feature B.
import {
  buildFormSchema,
  DEFAULT_CREATE_VALUES,
  type DocumentoFisicoFormValues,
} from '@/features/documentos-fisicos/schemas/documento-fisico-form-schema';
import type { TipoDocumentoFisico } from '@/types/api';

import { hoyEnLaPaz } from '../lib/hoy-en-la-paz';

interface DocumentoFisicoMiniFormProps {
  /** Tipos compatibles con el comprobante (ya pre-filtrados por el padre, D4/D8). */
  tiposCompatibles: TipoDocumentoFisico[];
  /** Número con el que arranca el campo — proviene del texto de búsqueda. */
  numeroInicial: string;
  /** create+asociar en curso — deshabilita los botones de acción. */
  isPending: boolean;
  onCancelar: () => void;
  /** Payload ya validado y normalizado (monto/moneda en null si no es tributario). */
  onCrear: (payload: DocumentoFisicoFormValues) => void;
}

/**
 * Mini-form de creación inline de un documento físico (D2), embebido en el
 * Popover del DocumentoFisicoCombobox.
 *
 * Se monta solo cuando el padre entra en la vista 'create-form', por lo que
 * `defaultValues` (con `hoyEnLaPaz()`) se evalúa fresco en cada apertura — sin
 * necesidad de reset manual al abrir.
 *
 * D1: monto y moneda solo se muestran (y validan) si el tipo es tributario.
 */
export function DocumentoFisicoMiniForm({
  tiposCompatibles,
  numeroInicial,
  isPending,
  onCancelar,
  onCrear,
}: DocumentoFisicoMiniFormProps): React.JSX.Element {
  const [tipoIdEnForm, setTipoIdEnForm] = useState('');

  const tipoEnFormSeleccionado = useMemo(
    () => tiposCompatibles.find((t) => t.id === tipoIdEnForm),
    [tiposCompatibles, tipoIdEnForm],
  );
  const esTributarioEnForm = tipoEnFormSeleccionado?.esTributario ?? false;
  // D-AUTO: cuando el tipo tiene numeración automática, el sistema asigna el número:
  // el campo se oculta y el número no se valida ni se envía (el backend lo rechaza con 422).
  const esAutoNumericoEnForm = tipoEnFormSeleccionado?.numeracionAutomatica ?? false;
  const miniFormSchema = useMemo(
    () => buildFormSchema(esTributarioEnForm, esAutoNumericoEnForm),
    [esTributarioEnForm, esAutoNumericoEnForm],
  );

  const miniForm = useForm<DocumentoFisicoFormValues>({
    resolver: zodResolver(miniFormSchema),
    // fechaEmision arranca en hoy (La Paz) para evitar tipeo manual; editable a mano.
    defaultValues: { ...DEFAULT_CREATE_VALUES, numero: numeroInicial, fechaEmision: hoyEnLaPaz() },
  });

  const {
    register: regMini,
    handleSubmit: handleMiniSubmit,
    formState: { errors: miniErrors },
    setValue: setMiniValue,
  } = miniForm;

  // Capturar el onChange de RHF para el select de tipo, para poder componerlo
  // con el handler propio sin romper la actualización interna de RHF.
  const { onChange: onChangeTipoRhf, ...regTipoRest } = regMini('tipoDocumentoFisicoId');

  function handleSubmitInterno(values: DocumentoFisicoFormValues): void {
    // Validar con schema correcto (esTributario puede haber cambiado).
    const result = miniFormSchema.safeParse(values);
    if (!result.success) {
      result.error.issues.forEach((e) => {
        const path = e.path[0];
        if (typeof path === 'string') {
          miniForm.setError(path as keyof DocumentoFisicoFormValues, { message: e.message });
        }
      });
      return;
    }
    const base = esTributarioEnForm
      ? values
      : { ...values, monto: null, moneda: null };
    // D-AUTO: omitir numero si el tipo es automático (el backend lo asigna; enviarlo → 422).
    const payload = esAutoNumericoEnForm ? { ...base, numero: undefined } : base;
    onCrear(payload);
  }

  return (
    <form
      onSubmit={(e) => {
        void handleMiniSubmit(handleSubmitInterno)(e);
      }}
      className="p-4 space-y-3"
      noValidate
    >
      <h3 className="text-sm font-semibold">Crear nuevo documento</h3>

      {/* Tipo */}
      <div className="space-y-1">
        <Label htmlFor="mini-tipo">
          Tipo <span className="text-destructive">*</span>
        </Label>
        <select
          {...regTipoRest}
          id="mini-tipo"
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1',
            'text-base shadow-xs outline-none md:text-sm',
            'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
          aria-invalid={miniErrors.tipoDocumentoFisicoId !== undefined}
          onChange={(e) => {
            setTipoIdEnForm(e.target.value);
            // Limpiar monto/moneda al cambiar tipo
            setMiniValue('monto', null, { shouldValidate: false });
            setMiniValue('moneda', null, { shouldValidate: false });
            // Propagar al onChange de RHF capturado en el render para
            // que _formValues se actualice correctamente.
            void onChangeTipoRhf(e);
          }}
        >
          <option value="">Seleccioná un tipo…</option>
          {tiposCompatibles.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
        {miniErrors.tipoDocumentoFisicoId !== undefined ? (
          <p className="text-xs text-destructive">{miniErrors.tipoDocumentoFisicoId.message}</p>
        ) : null}
      </div>

      {/* Número — D-AUTO: oculto cuando el tipo tiene numeración automática */}
      {esAutoNumericoEnForm ? (
        <div className="space-y-1">
          <Label className="text-muted-foreground">Número</Label>
          <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">
            Número asignado automáticamente por el sistema.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="mini-numero">
            Número <span className="text-destructive">*</span>
          </Label>
          <Input
            {...regMini('numero', {
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                setMiniValue('numero', e.target.value.toUpperCase(), { shouldValidate: false });
              },
            })}
            id="mini-numero"
            placeholder="Ej: F-001"
            className="text-base md:text-sm"
            aria-invalid={miniErrors.numero !== undefined}
          />
          {miniErrors.numero !== undefined ? (
            <p className="text-xs text-destructive">{miniErrors.numero.message}</p>
          ) : null}
        </div>
      )}

      {/* Fecha */}
      <div className="space-y-1">
        <Label htmlFor="mini-fecha">
          Fecha de emisión <span className="text-destructive">*</span>
        </Label>
        <Input
          {...regMini('fechaEmision')}
          id="mini-fecha"
          type="date"
          className="text-base md:text-sm"
          aria-invalid={miniErrors.fechaEmision !== undefined}
        />
        {miniErrors.fechaEmision !== undefined ? (
          <p className="text-xs text-destructive">{miniErrors.fechaEmision.message}</p>
        ) : null}
      </div>

      {/* Monto + Moneda — solo si esTributario (D1) */}
      {esTributarioEnForm ? (
        <>
          <div className="space-y-1">
            <Label htmlFor="mini-monto">
              Monto <span className="text-destructive">*</span>
            </Label>
            <Input
              {...regMini('monto')}
              id="mini-monto"
              type="text"
              placeholder="Ej: 1250.50"
              className="text-base md:text-sm"
              aria-invalid={miniErrors.monto !== undefined}
              aria-label="Monto"
            />
            {miniErrors.monto !== undefined ? (
              <p className="text-xs text-destructive">{miniErrors.monto.message}</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="mini-moneda">
              Moneda <span className="text-destructive">*</span>
            </Label>
            <select
              {...regMini('moneda')}
              id="mini-moneda"
              className={cn(
                'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1',
                'text-base shadow-xs outline-none md:text-sm',
                'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
              )}
              aria-invalid={miniErrors.moneda !== undefined}
              aria-label="Moneda"
            >
              <option value="">Seleccioná…</option>
              <option value="BOB">BOB</option>
              <option value="USD">USD</option>
            </select>
            {miniErrors.moneda !== undefined ? (
              <p className="text-xs text-destructive">{miniErrors.moneda.message}</p>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="flex gap-2 justify-end pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancelar}
          disabled={isPending}
        >
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Guardando…
            </>
          ) : (
            'Confirmar'
          )}
        </Button>
      </div>
    </form>
  );
}
