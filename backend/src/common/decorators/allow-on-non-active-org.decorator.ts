import { SetMetadata } from '@nestjs/common';

export const ALLOW_ON_NON_ACTIVE_ORG_KEY = 'allowOnNonActiveOrg';

// Guard rail declarativo para OrgStatusGuard: endpoints marcados con este
// decorator reciben mutaciones incluso si la org no está ACTIVE.
// Caso de uso esperado: POSTs de búsqueda/export que semánticamente son lecturas.
export const AllowOnNonActiveOrg = () => SetMetadata(ALLOW_ON_NON_ACTIVE_ORG_KEY, true);
