/**
 * Superficie cross-módulo que el módulo `notifications` expone al
 * módulo `invitations` para enviar el email de invitación.
 *
 * Responde a `§1.2` de `docs/deudas-arquitecturales.md`: antes, el
 * `InvitationsService` inyectaba `NotificationsService` concreto —
 * una clase con 5+ métodos de alto nivel (welcome, reset, subscription,
 * etc.) de los que invitations sólo usa uno.
 *
 * `NotificationPort` (el otro port del módulo) es la capa low-level
 * genérica que hablan los adapters SMTP/Resend/Console. Este port, en
 * cambio, es la superficie de "emails transaccionales del dominio
 * invitaciones" — intencionalmente chica.
 *
 * Regla §3.7 CLAUDE.md: todo port cross-módulo arranca con superficie
 * mínima. Si algún día otro módulo (ej. alertas de cierre mensual)
 * necesita otro email, se agrega su propio port distinto o se amplía
 * este con criterio.
 */

export interface InviteEmailData {
  inviterName: string;
  tenantName: string;
  inviteUrl: string;
}

export abstract class InvitationEmailsPort {
  /**
   * Envía el email de "X te invitó a unirte a Y" con un link de
   * aceptación. Idempotente a nivel del caller — invitations.service
   * asume que el provider puede re-intentar; el resultado se loguea
   * pero no se interpreta.
   */
  abstract sendInviteEmail(to: string, data: InviteEmailData): Promise<void>;
}

export const INVITATION_EMAILS_PORT = Symbol('INVITATION_EMAILS_PORT');
