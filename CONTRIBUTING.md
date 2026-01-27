# Contributing to Multi-Tenant SaaS Starter

First off, thank you for considering contributing to this project! 🎉

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Coding Guidelines](#coding-guidelines)
- [Commit Message Guidelines](#commit-message-guidelines)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Multi-Tenant-SaaS-Starter-NestJS.git
   cd Multi-Tenant-SaaS-Starter-NestJS
   ```
3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/Multi-Tenant-SaaS-Starter-NestJS.git
   ```

## Development Setup

### Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- Redis 6+
- pnpm (recommended) or npm

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Copy environment variables**:
   ```bash
   cp .env.example .env
   ```

3. **Configure your `.env`** with your local database credentials

4. **Run database migrations**:
   ```bash
   npx prisma migrate dev
   ```

5. **Seed the database** (optional):
   ```bash
   npx prisma db seed
   ```

6. **Start the development server**:
   ```bash
   npm run start:dev
   ```

7. **Access the API**:
   - API: http://localhost:3000/api
   - Swagger Docs: http://localhost:3000/docs

### Running Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## Making Changes

1. **Create a new branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make your changes** and ensure:
   - Code compiles without errors (`npm run build`)
   - All tests pass (`npm run test`)
   - Linting passes (`npm run lint`)
   - Code is formatted (`npm run format`)

3. **Add tests** for any new functionality

4. **Update documentation** if needed

## Submitting a Pull Request

1. **Push your branch** to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a Pull Request** against the `main` branch

3. **Fill out the PR template** completely

4. **Wait for review** - maintainers will review your PR and may request changes

5. **Address feedback** by pushing additional commits

6. Once approved, a maintainer will **merge your PR**

## Coding Guidelines

### TypeScript

- Use strict TypeScript (`strict: true` in tsconfig)
- Prefer `interface` over `type` for object shapes
- Use explicit return types for functions
- Avoid `any` - use `unknown` if type is truly unknown

### NestJS Conventions

- Use dependency injection
- Keep controllers thin - business logic goes in services
- Use DTOs with class-validator for input validation
- Use guards for authentication/authorization
- Use interceptors for cross-cutting concerns

### File Structure

```
src/
├── module-name/
│   ├── dto/               # Data Transfer Objects
│   ├── guards/            # Module-specific guards
│   ├── interfaces/        # TypeScript interfaces
│   ├── module-name.controller.ts
│   ├── module-name.service.ts
│   ├── module-name.module.ts
│   └── index.ts           # Public exports
```

### Testing

- Write unit tests for services
- Write E2E tests for API endpoints
- Use descriptive test names: `should return 401 when token is invalid`
- Mock external dependencies

## Commit Message Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, semicolons, etc.)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(auth): add password reset functionality

fix(billing): correct subscription renewal date calculation

docs(readme): add deployment instructions

test(tenants): add e2e tests for tenant creation
```

## Questions?

Feel free to open an issue with the `question` label if you have any questions!

---

Thank you for contributing! 💙
