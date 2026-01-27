# Multi-Tenant SaaS Starter for NestJS

> Production-ready NestJS backend for building SaaS applications with organizations, users, roles, strict tenant isolation, and billing-ready architecture. Think "Laravel Jetstream for NestJS".

![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)
![NestJS](https://img.shields.io/badge/NestJS-10-red)
![Prisma](https://img.shields.io/badge/Prisma-5-teal)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## ✨ Features

- **🏢 Multi-tenancy** — Row-level tenant isolation with automatic scoping
- **🔐 Authentication** — JWT with access/refresh token rotation
- **👥 Organizations** — Create tenants, invite users, switch contexts
- **🛡️ RBAC** — Role-based permissions (Owner, Admin, Member)
- **� Feature Flags** — Per-tenant feature toggles with global defaults
- **📊 Audit Logs** — Track all actions per tenant
- **💳 Billing-ready** — Interfaces for Stripe, Paddle, etc.
- **⚡ Rate Limiting** — Per-tenant throttling
- **🔴 Redis** — Caching layer with tenant isolation
- **🧪 Test Helpers** — Factory functions for E2E testing

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Gateway                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Rate Limiter → JWT Auth → Tenant Resolution → RBAC Guard   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   ┌─────────┐          ┌──────────┐          ┌─────────┐
   │  Auth   │          │ Tenants  │          │  Users  │
   └─────────┘          └──────────┘          └─────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                    ┌──────────────────┐
                    │  Tenant Context  │
                    │  (AsyncLocalStorage)
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Prisma Middleware│
                    │ (Auto tenant_id) │
                    └──────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   PostgreSQL     │
                    │  (Row-level)     │
                    └──────────────────┘
```

### Tenant Resolution

Every request knows which tenant it belongs to via:

1. **Header**: `X-Tenant-ID: <uuid>`
2. **JWT Claim**: `activeTenantId` from token payload
3. **Subdomain**: `acme.yoursaas.com` (production)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- pnpm/npm/yarn

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/multi-tenant-saas-starter-nestjs.git
cd multi-tenant-saas-starter-nestjs
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your database URL and secrets
```

### 3. Setup Database

```bash
npm run prisma:migrate
npm run seed
```

### 4. Start Development Server

```bash
npm run start:dev
```

API available at `http://localhost:3000/api`

## 📁 Project Structure

```
src/
├── auth/                    # JWT authentication
│   ├── strategies/          # Passport JWT/Local strategies
│   └── dto/                 # Login, Register, Refresh DTOs
├── tenants/                 # Organization management
├── users/                   # User profiles
├── memberships/             # User-Tenant relationships
├── rbac/                    # Role-based access control
│   ├── guards/              # Permissions guard
│   └── decorators/          # @RequirePermissions()
├── feature-flags/           # Feature toggle system
│   └── dto/                 # Feature flag DTOs
├── cache/                   # Redis caching layer
├── audit/                   # Audit logging
├── billing/                 # Billing interfaces (Stripe-ready)
│   └── interfaces/          # BillingProvider, QuotaChecker
├── common/
│   ├── guards/              # JwtAuthGuard, TenantGuard
│   ├── interceptors/        # TenantContext, Audit
│   ├── decorators/          # @CurrentUser, @CurrentTenant
│   └── tenant-context/      # AsyncLocalStorage context
└── main.ts
```

## 🔑 API Endpoints

### Authentication

| Method | Endpoint              | Description            |
|--------|----------------------|------------------------|
| POST   | `/api/auth/register` | Register new user      |
| POST   | `/api/auth/login`    | Login, get tokens      |
| POST   | `/api/auth/refresh`  | Refresh access token   |
| POST   | `/api/auth/logout`   | Revoke refresh token   |
| POST   | `/api/auth/switch-tenant` | Switch active tenant |

### Tenants

| Method | Endpoint                     | Description         |
|--------|------------------------------|---------------------|
| POST   | `/api/tenants`               | Create tenant       |
| GET    | `/api/tenants/current`       | Get current tenant  |
| PATCH  | `/api/tenants/current`       | Update tenant       |
| GET    | `/api/tenants/current/members` | List members      |

### Memberships

| Method | Endpoint                  | Description              |
|--------|--------------------------|--------------------------|
| POST   | `/api/memberships/invite` | Invite user to tenant   |
| PATCH  | `/api/memberships/:id`   | Update member role       |
| DELETE | `/api/memberships/:id`   | Remove member            |
| DELETE | `/api/memberships/leave` | Leave current tenant     |

### Users

| Method | Endpoint        | Description       |
|--------|----------------|-------------------|
| GET    | `/api/users/me` | Get profile       |
| PATCH  | `/api/users/me` | Update profile    |

### Billing

| Method | Endpoint                      | Description        |
|--------|------------------------------|--------------------|
| GET    | `/api/billing`               | Billing overview   |
| GET    | `/api/billing/limits`        | Plan limits        |
| GET    | `/api/billing/quota/:resource` | Check quota      |

### Audit

| Method | Endpoint       | Description       |
|--------|---------------|-------------------|
| GET    | `/api/audit`  | List audit logs   |

### Feature Flags

| Method | Endpoint                                  | Description                    |
|--------|------------------------------------------|--------------------------------|
| GET    | `/api/feature-flags`                     | Get all flags for tenant       |
| GET    | `/api/feature-flags/list`                | List flags (global + overrides)|
| GET    | `/api/feature-flags/:key/check`          | Check if feature enabled       |
| POST   | `/api/feature-flags/overrides`           | Create tenant override         |
| PUT    | `/api/feature-flags/overrides/:key`      | Update tenant override         |
| POST   | `/api/feature-flags/overrides/:key/toggle`| Toggle tenant override        |
| DELETE | `/api/feature-flags/overrides/:key`      | Delete tenant override         |

### Feature Flags Admin (Global)

| Method | Endpoint                                  | Description                    |
|--------|------------------------------------------|--------------------------------|
| GET    | `/api/admin/feature-flags`               | List all global flags          |
| POST   | `/api/admin/feature-flags`               | Create global flag             |
| PUT    | `/api/admin/feature-flags/:key`          | Update global flag             |
| POST   | `/api/admin/feature-flags/:key/toggle`   | Toggle global flag             |
| DELETE | `/api/admin/feature-flags/:key`          | Delete global flag             |

## 🔒 Tenant Isolation

### How It Works

1. **TenantContextInterceptor** extracts `tenantId` from request
2. Stores in **AsyncLocalStorage** for request lifecycle
3. **Prisma middleware** automatically adds `tenantId` to queries
4. **TenantGuard** blocks requests without tenant context

```typescript
// Automatic tenant scoping via Prisma middleware
this.$use(async (params, next) => {
  const tenantId = this.tenantContext.getTenantId();
  if (isTenantAware && tenantId) {
    params.args.where = {
      ...params.args.where,
      tenantId
    };
  }
  return next(params);
});
```

### Protected Models

These tables are automatically scoped by `tenant_id`:
- `Membership`
- `AuditLog`
- `RefreshToken`

## 🛡️ RBAC Permissions

### Roles

| Role   | Description                    |
|--------|--------------------------------|
| OWNER  | Full access, billing, transfer |
| ADMIN  | Manage users, read billing     |
| MEMBER | Basic access                   |

### Permissions

```typescript
const ROLE_PERMISSIONS = {
  OWNER: ['users.invite', 'users.manage', 'billing.read', 'billing.manage', 'tenant.update', 'audit.read'],
  ADMIN: ['users.invite', 'users.manage', 'billing.read', 'audit.read'],
  MEMBER: []
};
```

### Usage

```typescript
@Controller('memberships')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class MembershipsController {
  @Post('invite')
  @RequirePermissions('users.invite')
  async invite(@Body() dto: InviteUserDto) {
    // Only OWNER and ADMIN can access
  }
}
```

## 💳 Billing Integration

Ready-to-implement interfaces for payment providers:

```typescript
interface BillingProvider {
  createCustomer(tenant: Tenant): Promise<{ customerId: string }>;
  createCheckoutSession(tenantId: string, planId: string, ...): Promise<{ sessionUrl: string }>;
  hasActiveSubscription(tenantId: string): Promise<boolean>;
  // ... more methods
}
```

### Plan Limits

```typescript
const DEFAULT_PLAN_LIMITS = {
  FREE: { members: 3, projects: 5, apiCalls: 1000 },
  PRO: { members: 25, projects: 100, apiCalls: 50000 }
};
```

## 🚩 Feature Flags

### How It Works

Feature flags support global defaults with per-tenant overrides:

1. **Global flags** — Set by admins, apply to all tenants by default
2. **Tenant overrides** — Individual tenants can override global settings
3. **Caching** — Redis-backed with 60-second TTL for performance

### Usage in Controllers

```typescript
import { RequireFeature, FeatureFlagGuard } from './feature-flags';

@Controller('projects')
@UseGuards(JwtAuthGuard, TenantGuard, FeatureFlagGuard)
export class ProjectsController {
  @Get('export')
  @RequireFeature('advanced_export')
  async exportProjects() {
    // Only accessible if 'advanced_export' flag is enabled
  }
}
```

### Programmatic Check

```typescript
@Injectable()
export class MyService {
  constructor(private featureFlags: FeatureFlagsService) {}

  async doSomething(tenantId: string) {
    if (await this.featureFlags.isEnabled('beta_feature', tenantId)) {
      // Feature is enabled for this tenant
    }
  }
}
```

### Flag Resolution Order

1. Check tenant-specific override
2. Fall back to global flag
3. Default to `false` if not found

## 🔴 Redis Caching

### Setup

```bash
# Add Redis config to .env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

### Usage

```typescript
import { CacheService } from './cache';

@Injectable()
export class MyService {
  constructor(private cache: CacheService) {}

  async getData(tenantId: string) {
    // Tenant-isolated cache
    const cached = await this.cache.getTenantCache<MyData>(tenantId, 'my-key');
    if (cached) return cached;

    const data = await this.fetchData();
    await this.cache.setTenantCache(tenantId, 'my-key', data, 300); // 5 min TTL
    return data;
  }
}
```

### Rate Limiting Helper

```typescript
const { allowed, remaining, resetIn } = await this.cache.checkRateLimit(
  `api:${tenantId}:${endpoint}`,
  100,  // limit
  60    // window in seconds
);
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run e2e tests
npm run test:e2e

# Watch mode
npm run test:watch
```

### Test Factories

```typescript
import { createTestUserWithTenant, cleanupTestData } from './helpers/test-factory';

describe('My Feature', () => {
  beforeEach(async () => {
    const { user, tenant, membership } = await createTestUserWithTenant({
      email: 'test@example.com',
      role: Role.OWNER
    });
  });

  afterEach(() => cleanupTestData());
});
```

## 🗺️ Roadmap

### v1 (Current)
- [x] JWT Authentication
- [x] Multi-tenant architecture
- [x] RBAC permissions
- [x] Tenant isolation
- [x] Audit logging
- [x] Billing interfaces
- [x] Feature flags (per-tenant)
- [x] Redis caching

### v2 (Planned)
- [ ] Stripe integration
- [ ] Schema-per-tenant option
- [ ] Webhook system
- [ ] Admin panel
- [ ] Email verification
- [ ] Password reset
- [ ] 2FA/MFA

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

**Built with ❤️ for the NestJS community**
