import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { formatearFechaContable } from '@/lib/formatear-fecha-contable';
import { formatearMontoBob } from '@/lib/formatear-monto-bob';

import { useCandidatosArranque } from '../hooks/use-candidatos-arranque';
import { useDeclararArranque } from '../hooks/use-declarar-arranque';
import { deCentavos, objetivoDePartidas, sumaSeleccionada } from '../lib/objetivo-partidas';
import {
  declararArranqueSchema,
  type DeclararArranqueValues,
} from '../schemas/declarar-arranque-schema';

interface DeclararArranqueSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cuentaBancariaId: string;
  /** Fecha propuesta por defecto (el corte emitido); el usuario la puede cambiar. */
  fechaInicial: string;
}

/**
 * Declaración de un punto de arranque conciliado (REQ-ICB-04): un acto
 * atribuido y append-only, con los CUATRO datos declarados por el usuario.
 * La diferencia residual NO se autocompleta con extracto − libros — esa resta
 * incluiría las partidas en tránsito abiertas a esa fecha y congelaría un
 * residuo fantasma; lo que se declara es la parte asumida como inexplicable.
 *
 * Exige `contabilidad.conciliacion.conciliar` (el gate visual está en el
 * botón que abre este sheet; el candado real es el backend).
 */
export function DeclararArranqueSheet({
  open,
  onOpenChange,
  cuentaBancariaId,
  fechaInicial,
}: DeclararArranqueSheetProps): React.JSX.Element {
  const declarar = useDeclararArranque();
  const [seleccionadas, setSeleccionadas] = useState<ReadonlySet<string>>(new Set());

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<DeclararArranqueValues>({
    resolver: zodResolver(declararArranqueSchema),
    defaultValues: {
      fecha: fechaInicial,
      saldoExtracto: '',
      saldoLibros: '',
      diferenciaResidual: '',
      nota: '',
    },
  });

  const candidatos = useCandidatosArranque(cuentaBancariaId, watch('fecha'));
  const lista = candidatos.data ?? [];

  // La aritmética que desambigua. A la fecha del arranque:
  //   Σ partidas abiertas = saldoLibros − saldoExtracto + diferenciaResidual
  // Con los dos números a la vista, "¿este asiento de junio es un cheque en
  // circulación o la apertura?" deja de ser criterio y pasa a ser una cuenta.
  const objetivo = objetivoDePartidas(
    watch('saldoLibros'),
    watch('saldoExtracto'),
    watch('diferenciaResidual'),
  );
  const suma = sumaSeleccionada(lista, seleccionadas);
  const cierra = objetivo !== null && objetivo === suma;

  function alternar(referencia: string): void {
    setSeleccionadas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(referencia)) siguiente.delete(referencia);
      else siguiente.add(referencia);
      return siguiente;
    });
  }

  function handleSubmitInternal(values: DeclararArranqueValues): void {
    const nota = values.nota?.trim() ?? '';
    declarar.mutate(
      {
        cuentaBancariaId,
        fecha: values.fecha,
        saldoExtracto: values.saldoExtracto,
        saldoLibros: values.saldoLibros,
        diferenciaResidual: values.diferenciaResidual,
        ...(nota !== '' ? { nota } : {}),
        referenciasPartidas: [...seleccionadas],
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto overflow-x-hidden sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Declarar punto de arranque</SheetTitle>
          <SheetDescription>
            Fija el último día YA conciliado y los saldos con que cerró. El informe compara a
            partir del día siguiente. La declaración es permanente y queda atribuida: una nueva
            no borra las anteriores.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={(e) => void handleSubmit(handleSubmitInternal)(e)}
          className="px-4 pb-6"
          noValidate
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="arranque-fecha">Fecha del arranque — cierre del día</Label>
              <Input
                id="arranque-fecha"
                type="date"
                className="w-44 text-base md:text-sm"
                aria-invalid={errors.fecha !== undefined}
                {...register('fecha')}
              />
              <p className="text-xs text-muted-foreground">
                El último día que ya diste por conciliado. Los saldos de abajo son los del CIERRE
                de ese día — no los de su apertura. El informe compara desde el día siguiente.
              </p>
              {errors.fecha?.message !== undefined && (
                <p className="text-xs text-destructive">{errors.fecha.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="arranque-saldo-extracto">Saldo según extracto al cierre de esa fecha</Label>
              <Input
                id="arranque-saldo-extracto"
                inputMode="decimal"
                placeholder="1000.00"
                className="text-base md:text-sm"
                aria-invalid={errors.saldoExtracto !== undefined}
                {...register('saldoExtracto')}
              />
              {errors.saldoExtracto?.message !== undefined && (
                <p className="text-xs text-destructive">{errors.saldoExtracto.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="arranque-saldo-libros">Saldo según libros al cierre de esa fecha</Label>
              <Input
                id="arranque-saldo-libros"
                inputMode="decimal"
                placeholder="990.00"
                className="text-base md:text-sm"
                aria-invalid={errors.saldoLibros !== undefined}
                {...register('saldoLibros')}
              />
              {errors.saldoLibros?.message !== undefined && (
                <p className="text-xs text-destructive">{errors.saldoLibros.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="arranque-residual">Diferencia residual aceptada</Label>
              <Input
                id="arranque-residual"
                inputMode="decimal"
                placeholder="0.00"
                className="text-base md:text-sm"
                aria-invalid={errors.diferenciaResidual !== undefined}
                {...register('diferenciaResidual')}
              />
              <p className="text-xs text-muted-foreground">
                La parte de la diferencia que asumís como inexplicable a esa fecha. NO es
                extracto − libros: las partidas en tránsito abiertas se resuelven solas cuando
                llega la otra pata. Positiva cuando el extracto queda por encima de los libros.
              </p>
              {errors.diferenciaResidual?.message !== undefined && (
                <p className="text-xs text-destructive">{errors.diferenciaResidual.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">Partidas abiertas a esa fecha</p>
                <p className="text-xs text-muted-foreground">
                  Marcá las que se arrastran al informe: cheques girados y no cobrados, depósitos
                  que el banco todavía no registró. <strong>No marques</strong> lo que ya esté
                  dentro del saldo del extracto que declaraste — el asiento de apertura, por
                  ejemplo. El sistema no puede distinguirlos; vos sí.
                </p>
              </div>

              {candidatos.isPending && watch('fecha') !== '' ? (
                <p className="text-xs text-muted-foreground">Buscando partidas abiertas…</p>
              ) : null}

              {candidatos.isError ? (
                <p className="text-xs text-destructive">
                  No se pudieron cargar las partidas abiertas. Revisá la fecha e intentá de nuevo.
                </p>
              ) : null}

              {!candidatos.isPending && !candidatos.isError && lista.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay nada abierto a esa fecha: ambos lados arrancan parejos.
                </p>
              ) : null}

              {lista.map((c) => (
                <label
                  key={c.referencia}
                  className="flex items-start gap-2 text-xs"
                  htmlFor={`partida-${c.referencia}`}
                >
                  <input
                    id={`partida-${c.referencia}`}
                    type="checkbox"
                    className="mt-0.5"
                    checked={seleccionadas.has(c.referencia)}
                    onChange={() => alternar(c.referencia)}
                  />
                  <span className="flex-1">
                    <span className="font-medium">{formatearFechaContable(c.fecha)}</span>{' '}
                    <span className="tabular-nums">Bs {formatearMontoBob(c.importe)}</span>
                    {c.origen === 'MOVIMIENTO_IGNORADO' ? ' · ignorado' : ''}
                    <span className="block text-muted-foreground">{c.descripcion}</span>
                  </span>
                </label>
              ))}

              {objetivo !== null ? (
                <p
                  className={`text-xs ${cierra ? 'text-muted-foreground' : 'text-destructive'}`}
                  data-testid="verificacion-partidas"
                >
                  {cierra
                    ? `La selección cierra: suma Bs ${formatearMontoBob(deCentavos(suma))}, que es exactamente la diferencia entre los saldos declarados.`
                    : `Lo marcado suma Bs ${formatearMontoBob(deCentavos(suma))} y debería sumar Bs ${formatearMontoBob(deCentavos(objetivo))} para cuadrar con los saldos declarados. Si declarás así, la diferencia va a aparecer como residuo en el informe.`}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="arranque-nota">Nota (opcional)</Label>
              {/* Anti-F-14: Textarea dentro de Sheet siempre con field-sizing fijo. */}
              <Textarea
                id="arranque-nota"
                className="min-h-[80px] w-full max-w-full resize-y [field-sizing:fixed] text-base md:text-sm"
                aria-invalid={errors.nota !== undefined}
                {...register('nota')}
              />
              {errors.nota?.message !== undefined && (
                <p className="text-xs text-destructive">{errors.nota.message}</p>
              )}
            </div>
          </div>

          <SheetFooter className="mt-6 flex-col-reverse gap-2 px-0 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            {/* Anti-F-07: submit deshabilitado mientras la mutación corre. */}
            <Button type="submit" disabled={declarar.isPending}>
              {declarar.isPending ? 'Declarando…' : 'Declarar arranque'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
