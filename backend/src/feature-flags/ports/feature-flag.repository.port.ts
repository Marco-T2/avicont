import type { FeatureFlag, Prisma } from '@prisma/client';

export const FEATURE_FLAG_REPOSITORY_PORT = Symbol('FEATURE_FLAG_REPOSITORY_PORT');

/**
 * Data de creación. `organizationId = null` → flag global (catálogo).
 * `organizationId = <uuid>` → override por tenant.
 */
export interface CrearFeatureFlagData {
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  metadata: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  organizationId: string | null;
}

/**
 * Patch parcial — sólo los campos presentes se actualizan. El repo no
 * decide qué campos son parcheables; eso lo hace el service desde el DTO.
 */
export interface ActualizarFeatureFlagData {
  name?: string;
  description?: string;
  enabled?: boolean;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Contrato del repositorio de feature flags. Superficie interna completa
 * del módulo — el service la consume para los flujos admin (CRUD global
 * + overrides por tenant).
 *
 * Los consumers cross-módulo NO usan este port. Para lectura externa
 * (guard, granja.service, etc.) existe `FEATURE_FLAG_READER_PORT` con
 * la superficie mínima `isEnabled / getAllForTenant / invalidate`
 * (CLAUDE.md §3.7 + regla #5 del doc de deudas).
 *
 * Este repo es infra pura: no conoce cache — el caching vive en el
 * reader adapter. El service invalida cache explícitamente después de
 * cada mutación exitosa (post-commit).
 */
export abstract class FeatureFlagRepositoryPort {
  abstract findGlobal(key: string): Promise<FeatureFlag | null>;

  abstract findTenantOverride(organizationId: string, key: string): Promise<FeatureFlag | null>;

  abstract listGlobal(): Promise<FeatureFlag[]>;

  abstract listTenantOverrides(organizationId: string): Promise<FeatureFlag[]>;

  abstract create(data: CrearFeatureFlagData): Promise<FeatureFlag>;

  abstract update(id: string, data: ActualizarFeatureFlagData): Promise<FeatureFlag>;

  abstract delete(id: string): Promise<void>;
}
