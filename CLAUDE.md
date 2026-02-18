# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

openHAB Cloud is a TypeScript/Node.js backend service for openHAB home automation. It provides secure remote access, push notifications, OAuth2 authorization, and cloud integrations for openHAB instances.

## Build & Development Commands

```bash
# Install dependencies
npm install

# Start the application (uses tsx for TypeScript)
npm start

# Build TypeScript to dist/
npm run build

# Type-check without emitting
npm run typecheck

# Run unit tests
npm test

# Run tests with coverage
npm run test:coverage

# Run integration tests (requires Docker)
npm run docker:test:up      # Start MongoDB, Redis
npm run docker:test:seed    # Seed test data
npm run test:integration    # Run integration tests
npm run docker:test:down    # Stop containers

# License headers
npm run license:check       # Check headers (dry run)
npm run license:update      # Add/update headers
```

## Configuration

Copy `config-production.json` to `config.json` and configure MongoDB, Redis, and system settings. The application reads configuration from `config.json` at startup.

## Architecture

### Core Components

- **src/app.ts** - Main entry point. Initializes Express, middleware, MongoDB/Redis, Socket.IO, and background jobs.
- **src/socket/** - WebSocket server for real-time communication with openHAB instances.
- **src/middleware/auth.ts** - Passport.js authentication with multiple strategies.
- **src/config/** - Zod-validated configuration management.

### Request Flow

1. Express middleware chain (body parsing, sessions, CSRF, Passport)
2. Route handlers in `routes/` directory
3. Controllers/Services for business logic
4. Mongoose models for MongoDB data access
5. Redis for session storage and Socket.IO scaling

### Directory Structure

```
src/
├── config/         # Zod-validated configuration
├── types/          # TypeScript type definitions
├── models/         # Mongoose schemas with TypeScript
├── repositories/   # Data access layer
├── services/       # Business logic
├── controllers/    # Express route handlers
├── middleware/     # Auth, validation, guards
├── lib/            # Utilities (logger, redis, mailer, push)
├── socket/         # Socket.IO server and connection management
├── jobs/           # Background scheduled tasks
├── cli/            # CLI tools (makeadmin, makeinvites)
└── app.ts          # Main entry point

routes/             # Legacy Express routes (being migrated)
models/             # Legacy Mongoose models (being migrated)
views/              # EJS templates for web interface
templates/          # Email templates
```

### Authentication Strategies

Passport.js strategies in `src/middleware/auth.ts`:
- **LocalStrategy** - Web form login with username/password
- **BasicStrategy** - HTTP Basic Auth for REST API
- **BearerStrategy** - OAuth2 bearer tokens
- **ClientPasswordStrategy** - OAuth2 client authentication

### Real-time Communication

Socket.IO manages WebSocket connections from openHAB instances:
- UUID-based instance identification
- Request tracking for proxy requests
- Redis adapter for horizontal scaling

### Database Layer

- **MongoDB** via Mongoose - Primary data store
- **Redis** via redis - Session store, Socket.IO adapter, query caching

## Testing

### Unit Tests

Located in `tests/mocha/unit/` using Mocha + Chai + Sinon:

```
tests/mocha/unit/
├── controllers/    # Controller tests
├── services/       # Service tests
├── repositories/   # Repository tests
├── models/         # Model tests
└── lib/            # Utility tests
```

### Integration Tests

Located in `tests/integration/` - require Docker:

```
tests/integration/
├── clients/        # Test clients (OpenHAB simulator, API client)
├── socket/         # WebSocket/proxy tests
├── api/            # REST API tests
├── pages/          # Web page tests
└── concurrent/     # Race condition and load tests
```

Run with:
```bash
npm run docker:test:up && npm run docker:test:seed && npm run test:integration
```

## Key Dependencies

- **Express 5.x** - Web framework
- **Mongoose 9.x** - MongoDB ODM
- **Socket.IO 4.x** - WebSocket communication
- **Passport 0.7.x** - Authentication
- **oauth2orize** - OAuth2 authorization server
- **Winston** - Logging with daily rotation
- **Nodemailer** - Email sending
- **firebase-admin** / **apns2** - Push notifications
- **Zod** - Runtime type validation

## CLI Tools

```bash
# Make a user a staff member
npx tsx src/cli/makeadmin.ts <username>

# Generate invitation codes
npx tsx src/cli/makeinvites.ts [count] [email]
```

## Docker

Official images: [openhab/openhab-cloud](https://hub.docker.com/r/openhab/openhab-cloud)

```bash
# Using Docker Compose
docker compose up -d
```

See `deployment/docker-compose/README.md` for details.

## Code Standards

### Testing Requirements

When writing new code, include unit tests:

1. **Controllers** - Test each route handler with mocked services
2. **Services** - Test business logic with mocked repositories
3. **Repositories** - Test data access with mocked Mongoose models

Use dependency injection for testability - inject dependencies via constructor.

### Git Workflow

**Never commit directly to the main branch.** Always create a feature branch, commit there, and open a PR. All changes must go through pull requests.

This repository requires DCO (Developer Certificate of Origin) sign-off on all commits. Before creating commits, get the current git user with `git config user.name` and `git config user.email`, then always use the `--signoff` flag (or `-s`) to add the `Signed-off-by` trailer:

```bash
git checkout -b my-feature-branch
git commit --signoff -m "Your commit message"
```

### License Headers

All TypeScript files require EPL-2.0 license headers. Run `npm run license:update` to add/update headers.

## Code Review

After writing significant code, run the `code-skeptic-reviewer` agent to check for:
- Security issues (injection, auth bypass)
- Resource leaks (unclosed connections)
- Error handling gaps
- Type safety problems
- Performance concerns (N+1 queries, blocking operations)
