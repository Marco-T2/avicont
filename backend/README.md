# Multi-Tenant SaaS Starter for NestJS

> Production-ready NestJS backend for building SaaS applications with organizations, users, roles, strict tenant isolation, and billing-ready architecture. Think "Laravel Jetstream for NestJS".

[![CI](https://github.com/YOUR_USERNAME/Multi-Tenant-SaaS-Starter-NestJS/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/Multi-Tenant-SaaS-Starter-NestJS/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-red?logo=nestjs)](https://nestjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql)](https://www.postgresql.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

## ✨ Features

- **🏢 Multi-tenancy** — Row-level tenant isolation with automatic scoping
- **🔐 Authentication** — JWT with access/refresh token rotation
- **👥 Organizations** — Create tenants, invite users, switch contexts
- **🛡️ RBAC** — Role-based permissions (Owner, Admin, Member)
- **🚩 Feature Flags** — Per-tenant feature toggles with global defaults
- **📊 Audit Logs** — Track all actions per tenant
- **💳 Billing-ready** — Ports/Adapters pattern for Stripe, Paddle, etc.
- **📧 Notifications** — Email via SMTP, Resend, or console (dev)
- **⚡ Rate Limiting** — Per-tenant throttling
- **🔴 Redis** — Caching layer with tenant isolation
- **📖 Swagger** — Interactive API documentation at `/docs`
- **🧪 Test Helpers** — Factory functions for E2E testing

## 📚 Documentation

- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)
- [Changelog](CHANGELOG.md)

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
                    │ (AsyncLocalStorage)│
                    └──────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │  Billing │   │  Cache   │   │  Notify  │
        │  (Port)  │   │ (Redis)  │   │  (Port)  │
        └──────────┘   └──────────┘   └──────────┘
              │                             │
     ┌────────┴────────┐           ┌───────┴───────┐
     ▼        ▼        ▼           ▼       ▼       ▼
  Stripe   Paddle    Mock       SMTP   Resend  Console
```

### Tenant Resolution

Every request knows which tenant it belongs to via:

1. **Header**: `X-Tenant-ID: <uuid>`
2. **JWT Claim**: `activeTenantId` from token payload
3. **Subdomain**: `acme.yoursaas.com` (production)

## 🚀 Quick Start

### Prerequisites

- Node.js 24+
- PostgreSQL 14+
- Redis 6+ (optional, for caching)

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/Multi-Tenant-SaaS-Starter-NestJS.git
cd Multi-Tenant-SaaS-Starter-NestJS
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your database URL and secrets
```

### 3. Setup Database

```bash
npx prisma migrate dev
npx prisma db seed
```

### 4. Start Development Server

```bash
npm run start:dev
```

- **API**: http://localhost:3000/api
- **Swagger Docs**: http://localhost:3000/docs

### 🐳 Docker (Alternative)

```bash
docker-compose up -d
```

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
├── cache/                   # Redis caching layer
├── audit/                   # Audit logging
├── billing/                 # Payment integration
│   ├── ports/               # BillingPort interface
│   └── adapters/            # Stripe, Paddle, Mock
├── notifications/           # Email notifications
│   ├── ports/               # NotificationPort interface
│   └── adapters/            # SMTP, Resend, Console
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

### Feature Flags

| Method | Endpoint                                  | Description                    |
|--------|------------------------------------------|--------------------------------|
| GET    | `/api/feature-flags`                     | Get all flags for tenant       |
| GET    | `/api/feature-flags/:key/check`          | Check if feature enabled       |
| POST   | `/api/feature-flags/overrides`           | Create tenant override         |
| DELETE | `/api/feature-flags/overrides/:key`      | Delete tenant override         |

### Audit Logs

| Method | Endpoint       | Description       |
|--------|---------------|-------------------|
| GET    | `/api/audit`  | List audit logs   |

> 📖 **Full API documentation available at** `/docs` **(Swagger UI)**

## 🔒 Tenant Isolation

### How It Works

1. **TenantContextInterceptor** extracts `tenantId` from request
2. Stores in **AsyncLocalStorage** for request lifecycle
3. **PrismaService** helpers add `tenantId` to queries
4. **TenantGuard** blocks requests without tenant context

### Protected Models

These tables are automatically scoped by `tenant_id`:
- `Membership`
- `AuditLog`
- `RefreshToken`
- `FeatureFlag` (overrides)

## 🛡️ RBAC Permissions

| Role   | Permissions |
|--------|-------------|
| OWNER  | `users.invite`, `users.manage`, `billing.read`, `billing.manage`, `tenant.update`, `audit.read`, `settings.read`, `settings.write` |
| ADMIN  | `users.invite`, `users.manage`, `billing.read`, `audit.read`, `settings.read` |
| MEMBER | (none) |

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

## 💳 Billing (Ports/Adapters)

Swap payment providers without changing business logic:

```bash
# .env
BILLING_PROVIDER=stripe  # stripe | paddle | mock
```

Implement the `BillingPort` interface for any provider.

## 📧 Notifications (Ports/Adapters)

```bash
# .env
EMAIL_PROVIDER=console  # smtp | resend | console
```

Pre-built email templates: invite, welcome, password reset, subscription confirmation.

## 🚩 Feature Flags

```typescript
// Guard-based
@RequireFeature('beta_dashboard')
async getBetaDashboard() { ... }

// Programmatic
if (await this.featureFlags.isEnabled('new_feature', tenantId)) {
  // Feature enabled
}
```

## 🧪 Testing

```bash
npm test          # Unit tests
npm run test:e2e  # E2E tests
npm run test:cov  # Coverage
```

## 🗺️ Roadmap

- [x] JWT Authentication with refresh tokens
- [x] Multi-tenant architecture
- [x] RBAC permissions
- [x] Audit logging
- [x] Feature flags
- [x] Redis caching
- [x] Billing & Notification ports/adapters
- [x] Swagger documentation
- [ ] Stripe integration (full)
- [ ] Email verification flow
- [ ] Password reset flow
- [ ] 2FA/MFA
- [ ] Admin dashboard
- [ ] Webhook system

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🔐 Security

Please report security vulnerabilities by following our [Security Policy](SECURITY.md).

## 📄 License

[MIT](LICENSE) © 2026

---

**Built with ❤️ for the NestJS community**

⭐ Star this repo if you find it useful!
