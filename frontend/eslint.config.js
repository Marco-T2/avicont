import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `api.generated.ts` es artefacto de openapi-typescript (no se edita a mano,
  // se regenera con `pnpm run gen:api-types`). Se excluye del lint para no
  // acoplar el estilo del generador a las reglas del proyecto.
  globalIgnores(['dist', 'src/types/api.generated.ts']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Primitivos shadcn (la capa "ladrillo", frontend/CLAUDE.md §2): co-exportan
    // el componente y su función `cva` de variantes (badgeVariants, etc.).
    // react-refresh/only-export-components es una regla de DX/HMR, no de
    // correctitud — el costo de un reload completo de un primitivo es nulo.
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
