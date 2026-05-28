import { SystemRole } from '@/common/domain/enums';

import { AsignacionRolInvalidaError } from './membership-errors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Value object que encapsula la asignación de rol de una membership.
 * Enforza la invariante: EXACTAMENTE uno de `systemRole` o `customRoleId`
 * debe estar presente; nunca ambos, nunca ninguno. Reemplaza la validación
 * ad-hoc `assertExactlyOneRoleAssignment` que vivía inline en el service.
 */
export class MembershipRole {
  private constructor(
    readonly systemRole: SystemRole | null,
    readonly customRoleId: string | null,
  ) {}

  /** Rol de sistema (OWNER/ADMIN) — sin customRole. */
  static ofSystem(role: SystemRole): MembershipRole {
    return new MembershipRole(role, null);
  }

  /** Rol custom por ID — sin systemRole. Valida formato UUID. */
  static ofCustom(customRoleId: string): MembershipRole {
    if (typeof customRoleId !== 'string' || !UUID_REGEX.test(customRoleId)) {
      throw new AsignacionRolInvalidaError('customRoleId debe ser un UUID válido');
    }
    return new MembershipRole(null, customRoleId.toLowerCase());
  }

  /**
   * Parsea un input de DTO: exactamente uno de los campos debe estar
   * definido. `undefined`, `null` y strings vacíos/con solo espacios se
   * tratan como "no presente" (tolerancia a serialización de clientes).
   */
  static parse(input: {
    systemRole?: SystemRole | null;
    customRoleId?: string | null;
  }): MembershipRole {
    const hasSystem = input.systemRole != null;
    const customIdTrim = typeof input.customRoleId === 'string' ? input.customRoleId.trim() : null;
    const hasCustom = customIdTrim !== null && customIdTrim !== '';
    if (hasSystem === hasCustom) {
      throw new AsignacionRolInvalidaError(
        'debe especificarse exactamente uno de systemRole o customRoleId',
      );
    }
    return hasSystem
      ? MembershipRole.ofSystem(input.systemRole as SystemRole)
      : MembershipRole.ofCustom(customIdTrim as string);
  }

  isOwner(): boolean {
    return this.systemRole === SystemRole.OWNER;
  }

  isSystemRole(): boolean {
    return this.systemRole !== null;
  }

  equals(other: MembershipRole): boolean {
    return this.systemRole === other.systemRole && this.customRoleId === other.customRoleId;
  }
}
