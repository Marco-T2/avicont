import { Injectable } from '@nestjs/common';

import {
  InvitationEmailsPort,
  InviteEmailData,
} from '../ports/invitation-emails.port';
import { NotificationsService } from '../notifications.service';

/**
 * Adapter que conecta el port cross-módulo `InvitationEmailsPort` con el
 * `NotificationsService` existente. Envuelve `sendInviteEmail` descartando
 * el `EmailResult` del provider — los callers (invitations.service) sólo
 * necesitan saber "se envió o reventó", no el messageId del SMTP.
 */
@Injectable()
export class NotificationsInvitationEmailsAdapter extends InvitationEmailsPort {
  constructor(private readonly notifications: NotificationsService) {
    super();
  }

  async sendInviteEmail(to: string, data: InviteEmailData): Promise<void> {
    await this.notifications.sendInviteEmail(to, data);
  }
}
