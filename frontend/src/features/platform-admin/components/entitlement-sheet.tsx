import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import type { PlatformOrg, UpdateEntitlementRequest } from '@/types/api';

import { useUpdateEntitlement } from '../hooks/use-update-entitlement';
import {
  type EntitlementFormValues,
  entitlementSchema,
  PLANES_ORGANIZACION,
} from '../schemas/entitlement-schema';

interface EntitlementSheetProps {
  org: PlatformOrg | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function valoresDeOrg(org: PlatformOrg | null): EntitlementFormValues {
  return {
    plan: org?.plan ?? 'FREE',
    contabilidadEnabled: org?.contabilidadEnabled ?? false,
    granjaEnabled: org?.granjaEnabled ?? false,
  };
}

// El form siempre tiene los tres campos con valores concretos, así que se envía
// el estado resultante completo (el backend lo trata como tal). El tipo de
// request es parcial por exactOptionalPropertyTypes — se construye con spread
// para no acoplar el orden de las claves.
function buildPatch(values: EntitlementFormValues): UpdateEntitlementRequest {
  return {
    plan: values.plan,
    contabilidadEnabled: values.contabilidadEnabled,
    granjaEnabled: values.granjaEnabled,
  };
}

/**
 * Sheet-form de edición de entitlement (plan + verticales) de una org
 * (super-admin, PR-3). El guard de exclusividad (no ambas verticales true) se
 * valida en cliente vía zod (UX honesta); el backend es el candado real (422
 * PLATFORM_VERTICAL_NO_EXCLUSIVO, defense in depth). Cierra solo en éxito; en
 * error el form sigue abierto. Los toasts los emite useUpdateEntitlement (Anti-F-13).
 */
export function EntitlementSheet({
  org,
  open,
  onOpenChange,
}: EntitlementSheetProps): React.JSX.Element {
  const mutation = useUpdateEntitlement();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EntitlementFormValues>({
    resolver: zodResolver(entitlementSchema),
    defaultValues: valoresDeOrg(org),
  });

  // Re-sincroniza el form cuando cambia la org seleccionada (otra fila).
  useEffect(() => {
    reset(valoresDeOrg(org));
  }, [org, reset]);

  function handleOpenChange(next: boolean): void {
    if (!next) reset(valoresDeOrg(org));
    onOpenChange(next);
  }

  function onSubmit(values: EntitlementFormValues): void {
    if (org === null) return;
    mutation.mutate(
      { id: org.id, body: buildPatch(values) },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto overflow-x-hidden"
      >
        <SheetHeader>
          <SheetTitle>Entitlement</SheetTitle>
          <SheetDescription>
            Plan y verticales de «{org?.name ?? ''}». Una organización solo puede tener un
            vertical activo a la vez.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          <form
            onSubmit={(e) => {
              void handleSubmit(onSubmit)(e);
            }}
            className="space-y-5"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="ent-plan">Plan</Label>
              <Controller
                control={control}
                name="plan"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="ent-plan" aria-label="Plan" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLANES_ORGANIZACION.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Verticales
              </Label>

              <Controller
                control={control}
                name="contabilidadEnabled"
                render={({ field }) => (
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="ent-contabilidad" className="font-normal">
                      Contabilidad
                    </Label>
                    <Switch
                      id="ent-contabilidad"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </div>
                )}
              />

              <Controller
                control={control}
                name="granjaEnabled"
                render={({ field }) => (
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="ent-granja" className="font-normal">
                      Granja
                    </Label>
                    <Switch
                      id="ent-granja"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </div>
                )}
              />

              {errors.granjaEnabled?.message !== undefined ? (
                <p className="text-xs text-destructive">{errors.granjaEnabled.message}</p>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="w-full sm:w-auto"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Guardando…
                  </>
                ) : (
                  'Guardar'
                )}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
