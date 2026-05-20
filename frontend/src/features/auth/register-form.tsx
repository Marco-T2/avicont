import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createTenant } from '@/features/tenants/api/create-tenant';
import { switchTenant } from '@/features/tenants/api/switch-tenant';
import { api } from '@/lib/api';
import { backendErrorMessage } from '@/lib/error-messages';
import { useAuthStore } from '@/stores/auth-store';
import type { LoginResponse } from '@/types/api';

import { registerUser } from './api/register';
import {
  MODULOS_ORGANIZACION,
  registerSchema,
  type RegisterFormValues,
} from './register-schema';

// Alta self-service: crea la cuenta del usuario y su primera organización.
// Orquesta endpoints existentes y testeados (no hay register atómico en backend):
//   1) register  → crea el usuario (sin org)
//   2) login     → token SIN activeTenantId (el user aún no tiene memberships)
//   3) tenants   → crea la org + membership OWNER atómicamente
//   4) switch    → token nuevo YA con activeTenantId, listo para usar la app
export function RegisterForm(): React.JSX.Element {
  const [submitting, setSubmitting] = useState(false);
  const setToken = useAuthStore((s) => s.setToken);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      displayName: '',
      organizationName: '',
      modulo: 'CONTABILIDAD',
    },
  });

  async function onSubmit(values: RegisterFormValues): Promise<void> {
    setSubmitting(true);
    let authed = false;
    try {
      await registerUser({
        email: values.email,
        password: values.password,
        ...(values.displayName !== undefined && values.displayName.length > 0
          ? { displayName: values.displayName }
          : {}),
      });

      const login = await api.post<LoginResponse>('/api/auth/login', {
        email: values.email,
        password: values.password,
      });
      setToken(login.data.accessToken);
      authed = true;

      const org = await createTenant(values.organizationName, values.modulo);
      const switched = await switchTenant(org.id);
      setToken(switched.accessToken);

      void queryClient.invalidateQueries();
      toast.success('Cuenta y organización creadas — bienvenido');
      navigate('/', { replace: true });
    } catch (err) {
      // Si ya quedamos logueados pero falló crear o activar la organización,
      // limpiamos la sesión para no dejar al usuario sin tenant en el dashboard.
      if (authed) clear();
      toast.error(
        backendErrorMessage(err, 'No se pudo completar el registro'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>
          Registrá tu cuenta y tu organización para empezar
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="tu@empresa.bo"
              aria-invalid={errors.email !== undefined}
              {...register('email')}
            />
            {errors.email !== undefined ? (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.password !== undefined}
              {...register('password')}
            />
            {errors.password !== undefined ? (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">Tu nombre (opcional)</Label>
            <Input
              id="displayName"
              type="text"
              autoComplete="name"
              placeholder="Juan Pérez"
              aria-invalid={errors.displayName !== undefined}
              {...register('displayName')}
            />
            {errors.displayName !== undefined ? (
              <p className="text-xs text-destructive">
                {errors.displayName.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="organizationName">Nombre de la organización</Label>
            <Input
              id="organizationName"
              type="text"
              placeholder="Asociación de Avicultores XYZ"
              aria-invalid={errors.organizationName !== undefined}
              {...register('organizationName')}
            />
            {errors.organizationName !== undefined ? (
              <p className="text-xs text-destructive">
                {errors.organizationName.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="modulo">Tipo de organización</Label>
            <Controller
              control={control}
              name="modulo"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="modulo"
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
            {errors.modulo !== undefined ? (
              <p className="text-xs text-destructive">{errors.modulo.message}</p>
            ) : null}
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creando cuenta…
              </>
            ) : (
              'Crear cuenta'
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            ¿Ya tenés una cuenta?{' '}
            <Link to="/login" className="underline">
              Iniciar sesión
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
