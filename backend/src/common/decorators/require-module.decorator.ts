import { SetMetadata } from '@nestjs/common';

export const REQUIRE_MODULE_KEY = 'require-module';

// Módulos del sistema cubiertos por feature flags por organización.
// Cuando se agreguen módulos nuevos (ej. inventario, nómina), extender acá.
export type FeatureModule = 'contabilidad' | 'granja';

// Marca que un endpoint pertenece a un módulo. El ModuleEnabledGuard rechaza
// con 404 si el módulo está deshabilitado para la organización activa.
// Usar 404 (y no 403) es deliberado: el endpoint no existe a efectos prácticos
// si el módulo está apagado, no debe revelar que está apagado.
export const RequireModule = (module: FeatureModule) =>
  SetMetadata(REQUIRE_MODULE_KEY, module);
