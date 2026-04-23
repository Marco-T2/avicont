import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { InvitationStatus } from '@/types/api';

import { acceptAndRegisterInvitation } from '../api/accept-and-register-invitation';
import { acceptInvitation } from '../api/accept-invitation';
import { createInvitation } from '../api/create-invitation';
import { getInvitations } from '../api/get-invitations';
import { previewInvitation } from '../api/preview-invitation';
import { revokeInvitation } from '../api/revoke-invitation';

export function useInvitations(status: InvitationStatus = 'PENDING') {
  return useQuery({
    queryKey: ['invitations', status],
    queryFn: () => getInvitations(status),
    staleTime: 30_000,
  });
}

function useInvalidateInvitations(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['invitations'] });
  };
}

export function useCreateInvitation() {
  const invalidate = useInvalidateInvitations();
  return useMutation({
    mutationFn: createInvitation,
    onSuccess: () => invalidate(),
  });
}

export function useRevokeInvitation() {
  const invalidate = useInvalidateInvitations();
  return useMutation({
    mutationFn: (id: string) => revokeInvitation(id),
    onSuccess: () => invalidate(),
  });
}

// Preview público de la invitación a partir del token. Se usa en la página
// /accept-invite para renderizar "X te invita a unirte a Y" antes del submit.
export function useInvitationPreview(token: string | null) {
  return useQuery({
    queryKey: ['invitation-preview', token],
    queryFn: () => previewInvitation(token ?? ''),
    enabled: token !== null && token.length > 0,
    retry: false,
    staleTime: Infinity,
  });
}

export function useAcceptInvitation() {
  return useMutation({
    mutationFn: (token: string) => acceptInvitation(token),
  });
}

export function useAcceptAndRegisterInvitation() {
  return useMutation({
    mutationFn: acceptAndRegisterInvitation,
  });
}
