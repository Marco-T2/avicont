import { zodResolver } from '@hookform/resolvers/zod';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import {
  empresaFormSchema,
  type EmpresaFormValues,
} from '../schemas/empresa-form-schema';

// Etiquetas en español para cada tipo de empresa (Ley 843).
const TIPO_EMPRESA_LABELS: Record<string, string> = {
  COMERCIAL: 'Comercial',
  SERVICIOS: 'Servicios',
  TRANSPORTE: 'Transporte',
  INDUSTRIAL: 'Industrial',
  CONSTRUCCION: 'Construcción',
  PETROLERA: 'Petrolera',
  AGROPECUARIA: 'Agropecuaria',
  MINERA: 'Minera',
};

const TIPOS_EMPRESA = Object.keys(TIPO_EMPRESA_LABELS);

interface EmpresaFormProps {
  defaultValues: Partial<EmpresaFormValues>;
  onSubmit: (values: EmpresaFormValues) => void | Promise<void>;
  isPending: boolean;
  // false si ya existe una gestión fiscal → el tipo de empresa es inmutable (backend lo enforza).
  tipoEmpresaEditable: boolean;
}

// Componente presentacional: recibe props y emite callbacks.
// Anti-F-07: submit deshabilitado con isPending.
// Anti-F-10: colores vía tokens del tema.
// §7: inputs text-base md:text-sm para evitar auto-zoom en iOS.
// §14.7: Select disabled + tooltip cuando !tipoEmpresaEditable (UX honesta, no ocultar).
export function EmpresaForm({
  defaultValues,
  onSubmit,
  isPending,
  tipoEmpresaEditable,
}: EmpresaFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<EmpresaFormValues>({
    resolver: zodResolver(empresaFormSchema),
    defaultValues: {
      tipoEmpresaPrincipal: defaultValues.tipoEmpresaPrincipal ?? 'COMERCIAL',
      razonSocial: defaultValues.razonSocial ?? '',
      nit: defaultValues.nit ?? '',
      direccion: defaultValues.direccion ?? '',
      representanteLegal: defaultValues.representanteLegal ?? '',
      telefono: defaultValues.telefono ?? '',
      email: defaultValues.email ?? '',
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Tipo de empresa — Select controlado (shadcn Select requiere Controller) */}
      <div className="space-y-2">
        <Label htmlFor="tipoEmpresaPrincipal">Tipo de empresa</Label>
        <Controller
          name="tipoEmpresaPrincipal"
          control={control}
          render={({ field }) =>
            tipoEmpresaEditable ? (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={false}
              >
                <SelectTrigger
                  id="tipoEmpresaPrincipal"
                  aria-label="Tipo de empresa"
                  className="w-full text-base md:text-sm"
                  aria-invalid={errors.tipoEmpresaPrincipal !== undefined}
                >
                  <SelectValue placeholder="Seleccioná el tipo de empresa" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_EMPRESA.map((tipo) => (
                    <SelectItem key={tipo} value={tipo}>
                      {TIPO_EMPRESA_LABELS[tipo]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              // §14.7: disabled + tooltip — el candado real es el backend.
              // Un SelectTrigger disabled tiene pointer-events:none, así que el Tooltip
              // necesita el span wrapper para recibir el hover.
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex w-full">
                    <Select value={field.value} disabled>
                      <SelectTrigger
                        id="tipoEmpresaPrincipal"
                        aria-label="Tipo de empresa"
                        className="w-full text-base md:text-sm"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS_EMPRESA.map((tipo) => (
                          <SelectItem key={tipo} value={tipo}>
                            {TIPO_EMPRESA_LABELS[tipo]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  El tipo de empresa no se puede cambiar porque ya existe una gestión fiscal.
                </TooltipContent>
              </Tooltip>
            )
          }
        />
        {errors.tipoEmpresaPrincipal !== undefined ? (
          <p className="text-sm text-destructive">{errors.tipoEmpresaPrincipal.message}</p>
        ) : null}
      </div>

      {/* Razón social — fullwidth */}
      <div className="space-y-2">
        <Label htmlFor="razonSocial">Razón social</Label>
        <Input
          id="razonSocial"
          {...register('razonSocial')}
          placeholder="Nombre legal de la empresa"
          className="text-base md:text-sm"
          aria-invalid={errors.razonSocial !== undefined}
        />
        {errors.razonSocial !== undefined ? (
          <p className="text-sm text-destructive">{errors.razonSocial.message}</p>
        ) : null}
      </div>

      {/* NIT y Teléfono — 2 columnas en md+ */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="nit">NIT</Label>
          <Input
            id="nit"
            {...register('nit')}
            placeholder="7 a 12 dígitos"
            className="text-base md:text-sm"
            aria-invalid={errors.nit !== undefined}
          />
          {errors.nit !== undefined ? (
            <p className="text-sm text-destructive">{errors.nit.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="telefono">Teléfono</Label>
          <Input
            id="telefono"
            {...register('telefono')}
            placeholder="Teléfono de contacto"
            className="text-base md:text-sm"
            aria-invalid={errors.telefono !== undefined}
          />
          {errors.telefono !== undefined ? (
            <p className="text-sm text-destructive">{errors.telefono.message}</p>
          ) : null}
        </div>
      </div>

      {/* Email — fullwidth */}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          {...register('email')}
          placeholder="contacto@empresa.com"
          className="text-base md:text-sm"
          aria-invalid={errors.email !== undefined}
        />
        {errors.email !== undefined ? (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        ) : null}
      </div>

      {/* Representante legal — fullwidth */}
      <div className="space-y-2">
        <Label htmlFor="representanteLegal">Representante legal</Label>
        <Input
          id="representanteLegal"
          {...register('representanteLegal')}
          placeholder="Nombre del representante"
          className="text-base md:text-sm"
          aria-invalid={errors.representanteLegal !== undefined}
        />
        {errors.representanteLegal !== undefined ? (
          <p className="text-sm text-destructive">{errors.representanteLegal.message}</p>
        ) : null}
      </div>

      {/* Dirección — fullwidth */}
      <div className="space-y-2">
        <Label htmlFor="direccion">Dirección</Label>
        <Input
          id="direccion"
          {...register('direccion')}
          placeholder="Dirección fiscal"
          className="text-base md:text-sm"
          aria-invalid={errors.direccion !== undefined}
        />
        {errors.direccion !== undefined ? (
          <p className="text-sm text-destructive">{errors.direccion.message}</p>
        ) : null}
      </div>

      {/* Submit — Anti-F-07: deshabilitado con isPending */}
      <Button type="submit" disabled={isPending} className="w-full md:w-auto">
        {isPending ? 'Guardando...' : 'Guardar cambios'}
      </Button>
    </form>
  );
}
