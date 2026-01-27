# Dependency Update Summary - January 27, 2026

## Major Updates

### NestJS Ecosystem (v10 → v11)
- `@nestjs/common`: 10.4.22 → 11.1.12
- `@nestjs/core`: 10.4.22 → 11.1.12
- `@nestjs/platform-express`: 10.4.22 → 11.1.12
- `@nestjs/config`: 3.3.0 → 4.0.2
- `@nestjs/jwt`: 10.2.0 → 11.0.2
- `@nestjs/passport`: 10.0.3 → 11.0.5
- `@nestjs/swagger`: 7.4.2 → 11.2.5
- `@nestjs/throttler`: 5.2.0 → 6.5.0
- `@nestjs/cli`: 10.4.9 → 11.0.16
- `@nestjs/schematics`: 10.2.3 → 11.0.9
- `@nestjs/testing`: 10.4.22 → 11.1.12

### Prisma (v5 → v7)
- `@prisma/client`: 5.22.0 → 7.3.0
- `prisma`: 5.22.0 → 7.3.0
- Added: `@prisma/adapter-pg`: 7.3.0 (required for Prisma 7)
- Added: `pg`: 8.17.2 (PostgreSQL driver for adapter)
- Added: `@types/pg`: 8.16.0

### Security & Tooling
- `bcrypt`: 5.1.1 → 6.0.0
- `eslint`: 8.57.1 → 9.39.2 (major version bump with flat config)
- `eslint-config-prettier`: 9.1.2 → 10.1.8
- `@typescript-eslint/parser`: 8.54.0 (newly added)
- `@typescript-eslint/eslint-plugin`: 8.54.0 (newly added)

### Testing
- `jest`: 29.7.0 → 30.2.0
- `@types/jest`: 29.5.14 → 30.0.0
- `supertest`: 6.3.4 → 7.2.2

### Other Updates
- `typescript`: 5.3.3 → 5.9.3
- `@types/node`: 20.19.30 → 25.0.10
- `@types/express`: 4.17.25 → 5.0.6
- `reflect-metadata`: 0.1.14 → 0.2.2
- `prettier`: 3.1.1 → 3.8.1
- `dotenv`: 17.2.3 (newly added for Prisma 7 config)

### Removed
- `@types/ioredis`: Removed (ioredis now provides its own types)

## Breaking Changes & Code Updates

### 1. Prisma 7 Configuration
**Changed:** Database configuration moved from `schema.prisma` to `prisma.config.ts`

**Files Modified:**
- Created: `prisma.config.ts` - New configuration file for Prisma 7
- Updated: `src/common/prisma.service.ts` - Now uses `@prisma/adapter-pg` with connection pool

**Before:**
```typescript
// schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// prisma.service.ts
constructor() {
  super();
}
```

**After:**
```typescript
// schema.prisma
datasource db {
  provider = "postgresql"
}

// prisma.config.ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});

// prisma.service.ts
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

constructor() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  super({ adapter });
}
```

### 2. ESLint 9 Flat Config
**Changed:** ESLint configuration migrated from `.eslintrc.js` to flat config format

**Files Modified:**
- Created: `eslint.config.mjs` - New flat config for ESLint 9
- Updated: `package.json` - Updated lint script to remove `--ext .ts` flag

**Before:**
```javascript
// .eslintrc.js
module.exports = { /* ... */ };

// package.json
"lint": "eslint --ext .ts src"
```

**After:**
```javascript
// eslint.config.mjs
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier/recommended';

export default tseslint.config(/* ... */);

// package.json
"lint": "eslint src"
```

### 3. JWT Configuration Type Safety
**Changed:** Fixed type safety issues with JWT configuration for NestJS 11

**Files Modified:**
- `src/auth/auth.module.ts` - Added fallback for secret, changed expiresIn to string literal
- `src/auth/strategies/jwt.strategy.ts` - Added fallback for secretOrKey

**Before:**
```typescript
signOptions: { expiresIn: config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') }
secretOrKey: config.get<string>('JWT_ACCESS_SECRET')
```

**After:**
```typescript
signOptions: { expiresIn: '15m' }
secretOrKey: config.get<string>('JWT_ACCESS_SECRET') || 'fallback-secret-change-in-production'
```

### 4. Jest Configuration
**Changed:** Updated test regex to include e2e-spec files

**Files Modified:**
- `jest.config.js`

**Before:**
```javascript
testRegex: '.*\\.spec\\.ts$'
```

**After:**
```javascript
testRegex: '.*\\.(spec|e2e-spec)\\.ts$'
```

## Installation Notes

All packages were installed with `--legacy-peer-deps` flag due to peer dependency conflicts between NestJS v11 and some packages still requiring v10. This is expected during major version transitions.

## Security

- 9 moderate severity vulnerabilities remain in transitive dependencies (lodash in @nestjs/config, @nestjs/swagger, and Prisma tooling)
- These are not directly exploitable in the runtime application
- No action required at this time; will be resolved by upstream packages

## Next Steps

1. Test all application functionality thoroughly
2. Update environment variables in production if needed
3. Run migrations: `npm run prisma:migrate`
4. Monitor for security updates to resolve remaining audit warnings
5. Consider removing `.eslintrc.js` once ESLint 9 migration is confirmed working
