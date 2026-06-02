import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { cn } from '@/lib/utils';

import { useCreateOrg } from '../hooks/use-create-org';
import {
  type CreateOrgFormValues,
  createOrgSchema,
  DEFAULT_CREATE_ORG_VALUES,
  MODULOS_ORGANIZACION,
} from '../schemas/create-org-schema';

interface CreateOrgSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Sheet-form de creación de organización (super-admin, PR-2). El OWNER se designa
// por email; el backend valida que exista (422 PLATFORM_ORG_OWNER_NOT_FOUND si no).
// Cierra el drawer solo en éxito; en error el form sigue abierto para corregir el
// email. Los toasts (éxito/error) los emite useCreateOrg (Anti-F-13).
export function CreateOrgSheet({ open, onOpenChange }: CreateOrgSheetProps): React.JSX.Element {
  const createMutation = useCreateOrg();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateOrgFormValues>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: DEFAULT_CREATE_ORG_VALUES,
  });

  function handleOpenChange(next: boolean): void {
    if (!next) reset(DEFAULT_CREATE_ORG_VALUES);
    onOpenChange(next);
  }

  function onSubmit(values: CreateOrgFormValues): void {
    createMutation.mutate(values, {
      onSuccess: () => {
        reset(DEFAULT_CREATE_ORG_VALUES);
        onOpenChange(false);
      },
    });
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto overflow-x-hidden"
      >
        <SheetHeader>
          <SheetTitle>Nueva organización</SheetTitle>
          <SheetDescription>
            Creá una organización y designá a su responsable (OWNER) por email. El email
            debe corresponder a un usuario ya registrado.
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
            <Field label="Nombre" htmlFor="org-name" required error={errors.name?.message}>
              <Input
                {...register('name')}
                id="org-name"
                placeholder="Asociación Avícola Cochabamba"
                className="text-base md:text-sm"
                aria-invalid={errors.name !== undefined}
              />
            </Field>

            <Field
              label="Tipo de organización"
              htmlFor="org-modulo"
              required
              error={errors.modulo?.message}
            >
              <Controller
                control={control}
                name="modulo"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger
                      id="org-modulo"
                      aria-label="Tipo de organización"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODULOS_ORGANIZACION.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground">
                Determina el vertical y los datos iniciales que se siembran.
              </p>
            </Field>

            <Field
              label="Email del responsable"
              htmlFor="org-owner-email"
              required
              error={errors.ownerEmail?.message}
            >
              <Input
                {...register('ownerEmail')}
                id="org-owner-email"
                type="email"
                autoComplete="off"
                placeholder="responsable@empresa.bo"
                className="text-base md:text-sm"
                aria-invalid={errors.ownerEmail !== undefined}
              />
              <p className="text-xs text-muted-foreground">
                Debe ser un usuario ya registrado en el sistema.
              </p>
            </Field>

            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="w-full sm:w-auto"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creando…
                  </>
                ) : (
                  'Crear organización'
                )}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string | undefined;
  className?: string;
  children: React.ReactNode;
}

function Field({
  label,
  htmlFor,
  required,
  error,
  className,
  children,
}: FieldProps): React.JSX.Element {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="flex items-center gap-1">
        {label}
        {required === true ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {error !== undefined ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
