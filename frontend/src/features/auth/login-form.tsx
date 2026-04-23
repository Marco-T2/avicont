import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
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
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import type { LoginResponse } from '@/types/api';

import { loginSchema, type LoginFormValues } from './login-schema';

interface LocationState {
  from?: { pathname: string };
}

export function LoginForm(): React.JSX.Element {
  const [submitting, setSubmitting] = useState(false);
  const setToken = useAuthStore((s) => s.setToken);
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as LocationState | null | undefined)?.from?.pathname ?? '/';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginFormValues): Promise<void> {
    setSubmitting(true);
    try {
      const res = await api.post<LoginResponse>('/api/auth/login', values);
      setToken(res.data.accessToken);
      toast.success('Sesión iniciada');
      navigate(from, { replace: true });
    } catch (err) {
      const isAxios =
        typeof err === 'object' && err !== null && 'response' in err;
      const status = isAxios
        ? (err as { response?: { status?: number } }).response?.status
        : undefined;
      toast.error(
        status === 401
          ? 'Credenciales inválidas'
          : 'Error al iniciar sesión. Reintentá en unos segundos.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
        <CardDescription>Ingresá tus credenciales para continuar</CardDescription>
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
              autoComplete="current-password"
              aria-invalid={errors.password !== undefined}
              {...register('password')}
            />
            {errors.password !== undefined ? (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            ) : null}
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Ingresando...
              </>
            ) : (
              'Iniciar sesión'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
