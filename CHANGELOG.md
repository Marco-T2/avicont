# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-01-27
### Added
- Initial public release of Multi-Tenant SaaS Starter (NestJS)
- JWT authentication with refresh token rotation
- Multi-tenant isolation with AsyncLocalStorage and guards
- Tenants, Users, Memberships modules with RBAC
- Audit logging module
- Billing module with Stripe adapter, Paddle stub, and mock provider
- Redis cache module with tenant-aware caching and rate limiting
- Feature flags module with global defaults and tenant overrides
- Notifications module with SMTP, Resend, and console adapters
- Swagger documentation and HTTP client request files
- E2E tests for auth and tenant isolation
