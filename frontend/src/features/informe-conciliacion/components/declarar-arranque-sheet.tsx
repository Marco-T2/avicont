import { zodResolver } from '@hookform/resolvers/zod';
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

import { useDeclararArranque } from '../hooks/use-declarar-arranque';
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

  const {
    register,
    handleSubmit,
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
            Fija desde qué fecha y con qué saldos se comparan el extracto y los libros. La
            declaración es permanente y queda atribuida: una nueva no borra las anteriores.
          </SheetDescription>
        </SheetHeader>

        <form
          onSubmit={(e) => void handleSubmit(handleSubmitInternal)(e)}
          className="px-4 pb-6"
          noValidate
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="arranque-fecha">Fecha del arranque</Label>
              <Input
                id="arranque-fecha"
                type="date"
                className="w-44 text-base md:text-sm"
                aria-invalid={errors.fecha !== undefined}
                {...register('fecha')}
              />
              {errors.fecha?.message !== undefined && (
                <p className="text-xs text-destructive">{errors.fecha.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="arranque-saldo-extracto">Saldo según extracto</Label>
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
              <Label htmlFor="arranque-saldo-libros">Saldo según libros</Label>
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
