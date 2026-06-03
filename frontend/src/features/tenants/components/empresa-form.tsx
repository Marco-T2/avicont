import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  empresaFormSchema,
  type EmpresaFormValues,
} from '../schemas/empresa-form-schema';

interface EmpresaFormProps {
  defaultValues: Partial<EmpresaFormValues>;
  onSubmit: (values: EmpresaFormValues) => void | Promise<void>;
  isPending: boolean;
}

// Componente presentacional: recibe props y emite callbacks.
// Anti-F-07: submit deshabilitado con isPending.
// Anti-F-10: colores vía tokens del tema.
// §7: inputs text-base md:text-sm para evitar auto-zoom en iOS.
export function EmpresaForm({ defaultValues, onSubmit, isPending }: EmpresaFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EmpresaFormValues>({
    resolver: zodResolver(empresaFormSchema),
    defaultValues: {
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
