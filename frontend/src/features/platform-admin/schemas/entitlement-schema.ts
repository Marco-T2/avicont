import { z } from 'zod';

import type { OrgPlan } from '@/types/api';

// Opciones del selector de plan. El value viaja al backend (UpdateEntitlementDto.plan).
export const PLANES_ORGANIZACION = [
  { value: 'FREE', label: 'Free' },
  { value: 'PRO', label: 'Pro' },
] as const satisfies readonly { value: OrgPlan; label: string }[];

// Espeja backend platform/dto/update-entitlement.dto.ts. El form siempre tiene
// los tres campos (plan + dos switches) con valores concretos; el hook arma el
// patch parcial al enviar. La regla de exclusividad de vertical
// (§10.4 plataforma-multi-vertical) se valida en cliente como UX honesta: el
// candado real es el backend (422 PLATFORM_VERTICAL_NO_EXCLUSIVO), defense in depth.
export const entitlementSchema = z
  .object({
    plan: z.enum(['FREE', 'PRO'] as const),
    contabilidadEnabled: z.boolean(),
    granjaEnabled: z.boolean(),
  })
  .refine((data) => !(data.contabilidadEnabled && data.granjaEnabled), {
    message: 'Una organización solo puede tener un vertical activo (Contabilidad o Granja, no ambos)',
    path: ['granjaEnabled'],
  });

export type EntitlementFormValues = z.infer<typeof entitlementSchema>;
