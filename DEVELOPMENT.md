# Development Guide

This guide covers everything you need to start developing on the openHAB Cloud codebase.

## Overview

openHAB Cloud is a backend service that connects local [openHAB](https://www.openhab.org/) smart home instances to the cloud. It provides:

- **Secure remote access** — proxy HTTP and WebSocket requests to a user's local openHAB through Socket.IO
- **Push notifications** — deliver alerts to mobile devices via Firebase Cloud Messaging (FCM)
- **OAuth2 authorization** — third-party applications can access openHAB APIs on behalf of users
- **IFTTT integration** — trigger IFTTT applets from openHAB events
- **Web dashboard** — manage accounts, devices, notifications, and connected openHAB instances

**Tech stack:** Node.js 22+, TypeScript, Express 5, Mongoose 9, Socket.IO 4, Redis, Zod.

## Prerequisites

| Requirement           | Purpose                              |
|-----------------------|--------------------------------------|
| Node.js >= 22        | Runtime                              |
| MongoDB               | Primary data store                   |
| Redis                 | Sessions, Socket.IO adapter, locking |
| Docker (optional)     | Integration tests                    |

## Quick Start

```bash
# Install dependencies
npm install

# Create your local configuration
cp docker/config.test.json config.json
# Edit config.json with your MongoDB, Redis, and other settings

# Start the application (uses tsx for TypeScript)
npm start
```

The server listens on the port defined in `config.json` → `system.port` (default 3000).

## Build & Test Commands

### Build

| Command              | Description                           |
|----------------------|---------------------------------------|
| `npm start`          | Run the app directly with tsx         |
| `npm run build`      | Compile TypeScript to `dist/`         |
| `npm run build:watch`| Compile in watch mode                 |
| `npm run typecheck`  | Type-check without emitting files     |

### Tests

| Command                            | Description                             |
|------------------------------------|-----------------------------------------|
| `npm test`                         | Run unit tests (Mocha + Chai + Sinon)   |
| `npm run test:unit`                | Same as `npm test`                      |
| `npm run test:coverage`            | Unit tests with nyc coverage report     |
| `npm run test:integration`         | Run all integration tests               |
| `npm run test:integration:socket`  | Socket/proxy integration tests only     |
| `npm run test:integration:api`     | REST API integration tests only         |
| `npm run test:integration:pages`   | Web page integration tests only         |
| `npm run test:integration:concurrent` | Concurrency and load tests           |

### Integration Test Infrastructure

Integration tests require Docker containers (MongoDB, Redis, the app, nginx):

```bash
npm run docker:test:up       # Start containers
npm run docker:test:seed     # Seed test data
npm run test:integration     # Run tests
npm run docker:test:down     # Stop and remove containers
```

Other Docker commands: `docker:test:logs`, `docker:test:logs:app`, `docker:test:restart`.

### CLI Tools

| Command                  | Description                          |
|--------------------------|--------------------------------------|
| `npm run cli:makeadmin`  | Grant staff privileges to a user     |
| `npm run cli:makeinvites`| Generate invitation codes            |

Or run directly: `npx tsx src/cli/makeadmin.ts <username>`

### Maintenance

| Command                    | Description                              |
|----------------------------|------------------------------------------|
| `npm run license:check`    | Dry-run license header check             |
| `npm run license:update`   | Add/update EPL-2.0 license headers       |
| `npm run deps:audit`       | Run npm audit                            |
| `npm run deps:check`       | Check for dependency updates (ncu)       |
| `npm run deps:upgrade`     | Upgrade dependencies in package.json     |
| `npm run deps:check:minor` | Check for minor updates only             |
| `npm run deps:upgrade:minor`| Upgrade minor versions only             |

You can also use `npx ncu -i` for an interactive prompt that lets you pick which dependencies to upgrade. Dependabot is configured to open weekly PRs for dependency updates.

## Project Structure

```
openhab-cloud/
├── src/                  # TypeScript application source
├── views/                # EJS templates (server-rendered HTML pages)
├── templates/            # Email templates (Nodemailer/email-templates)
├── public/               # Static assets (CSS, JS, images, fonts)
├── tests/
│   ├── mocha/unit/       # Unit tests (mirrors src/ structure)
│   └── integration/      # Integration tests (require Docker)
├── docker/               # Docker configs for test infrastructure
├── deployment/           # Production deployment configs (Docker Compose, nginx, Traefik)
├── scripts/              # Build/maintenance scripts (license headers)
├── config.json           # Local configuration (not committed)
└── package.json
```

## Source Code Architecture

```
src/
├── app.ts              # Entry point — wires everything together
├── config/             # Zod-validated configuration loading
├── types/              # TypeScript interfaces (models, notifications, Express augmentations)
├── models/             # Mongoose schema definitions (one file per entity)
├── services/           # Business logic (interface-driven, no direct Mongoose imports)
├── factories/          # Wires services to their Mongoose model dependencies
├── controllers/        # Express route handlers (one class per feature area)
├── routes/             # Route registration + request-scoped middleware
├── middleware/          # Passport config, Zod validation, route guards
├── schemas/            # Zod schemas for request body validation
├── socket/             # Socket.IO server, proxy handler, connection locking
├── repositories/       # Thin data-access wrappers (notification, userdevice)
├── lib/                # Utilities (logger, Redis, MongoDB, date, push notifications)
├── jobs/               # Cron-scheduled background tasks with distributed locking
└── cli/                # Command-line tools (makeadmin, makeinvites)
```

### Entry Point: `src/app.ts`

The startup sequence:

1. Load and validate configuration (Zod)
2. Create Winston logger
3. Connect to Redis
4. Connect to MongoDB via Mongoose
5. Create Express app with middleware (sessions, CSRF, Passport)
6. Create services via factory
7. Configure Passport authentication strategies
8. Set up Socket.IO server with connection manager
9. Mount Express routes
10. Register and start background jobs (cron)
11. Listen on configured port

### `src/config/`

Zod-validated configuration management.

- `schema.ts` — Zod schemas defining the shape of every config section (system, express, mongodb, redis, mailer, gcm, ifttt, legal, apps)
- `index.ts` — `loadConfig()` reads and validates JSON; `SystemConfigManager` provides typed accessor methods

### `src/types/`

TypeScript interfaces shared across the codebase.

- `models.ts` — Interfaces for all Mongoose document types (User, Openhab, Notification, OAuth2Client, etc.)
- `notification.ts` — Push notification and device type definitions
- `connection.ts` — Redis connection info for openHAB instances
- `express.d.ts` — Global augmentations for Express Request, Response, and Session

### `src/models/`

Mongoose schema definitions. Each file defines one entity:

| File                    | Entity                                |
|-------------------------|---------------------------------------|
| `user.model.ts`         | User accounts                         |
| `user-account.model.ts` | User account configuration            |
| `openhab.model.ts`      | openHAB instances                     |
| `user-device.model.ts`  | Registered mobile devices             |
| `notification.model.ts` | Push notifications                    |
| `event.model.ts`        | System events                         |
| `item.model.ts`         | openHAB items                         |
| `oauth2.model.ts`       | OAuth2 clients, codes, and tokens     |
| `enrollment.model.ts`   | OAuth2 enrollments/authorizations     |
| `verification.model.ts` | Email verification and password reset |
| `invitation.model.ts`   | Invitation codes                      |

### `src/services/`

Business logic layer. Services define the repository/model interfaces they need (dependency injection) and do not import Mongoose models directly.

| File                       | Responsibility                                      |
|----------------------------|-----------------------------------------------------|
| `user.service.ts`          | Registration, password management, account ops      |
| `auth.service.ts`          | Credential validation, OAuth2 client/bearer auth    |
| `notification.service.ts`  | Notification persistence + FCM push delivery        |
| `email.service.ts`         | Email sending via Nodemailer (verification, reset)  |
| `openhab.service.ts`       | openHAB instance operations                         |

### `src/factories/`

- `service.factory.ts` — `createServices()` wires services to their Mongoose model dependencies using inline adapter objects that satisfy service interfaces.

### `src/controllers/`

Express route handlers. Each controller class receives typed dependencies via constructor — controllers don't know about Mongoose.

| File                              | Routes                                    |
|-----------------------------------|-------------------------------------------|
| `homepage.controller.ts`          | Landing page                              |
| `registration.controller.ts`      | User registration                         |
| `account.controller.ts`           | Account settings, openHAB management      |
| `api.controller.ts`               | REST API (`/api/*`)                       |
| `oauth2.controller.ts`            | OAuth2 authorization server               |
| `ifttt.controller.ts`             | IFTTT integration webhooks                |
| `devices.controller.ts`           | Device management                         |
| `events.controller.ts`            | Event history                             |
| `items.controller.ts`             | openHAB items                             |
| `notifications-view.controller.ts`| Notification history                      |
| `invitations.controller.ts`       | Invitation codes                          |
| `applications.controller.ts`      | Registered OAuth2 applications            |
| `staff.controller.ts`             | Admin user management                     |
| `users.controller.ts`             | User management (list, create, delete)    |
| `health.controller.ts`            | Health check endpoint                     |
| `timezone.controller.ts`          | Timezone info                             |

### `src/routes/`

- `index.ts` — Creates the Express Router. Instantiates controllers with adapter objects (wrapping Mongoose models to match controller interfaces), and binds all routes.
- `middleware.ts` — Request-scoped middleware: auth checks, openHAB connection caching, proxy body assembly.

### `src/middleware/`

- `auth.middleware.ts` — Configures Passport strategies (Local, Basic, Bearer, ClientPassword)
- `validation.middleware.ts` — `validateBody()` / `validateParams()` middleware using Zod schemas
- `guards.ts` — Route guards: `ensureAuthenticated`, `ensureRestAuthenticated`, `ensureMaster`, `ensureStaff`

### `src/schemas/`

- `index.ts` — Zod schemas for request body validation (login, registration, account updates, passwords, devices, invitations, notifications, FCM registration)

### `src/socket/`

Real-time communication with openHAB instances via Socket.IO.

| File                      | Responsibility                                                     |
|---------------------------|--------------------------------------------------------------------|
| `socket-server.ts`        | Orchestrator: connection auth, proxy response forwarding, notifications, disconnect cleanup |
| `connection-manager.ts`   | Redis-based distributed locking — ensures each openHAB UUID connects to exactly one cloud node |
| `proxy-handler.ts`        | Reassembles chunked HTTP/WebSocket responses from openHAB back to the HTTP client |
| `request-tracker.ts`      | Tracks in-flight proxy requests with timeout cleanup               |
| `websocket-tracker.ts`    | Tracks active WebSocket proxy connections                          |
| `socket-writer.ts`        | Utility for writing Socket.IO data to Express responses            |
| `types.ts`                | TypeScript interfaces for socket events, connection info, request tracking |

### `src/repositories/`

Thin data-access wrappers used by the notification service:

- `notification.repository.ts` — Notification CRUD
- `userdevice.repository.ts` — User device CRUD

### `src/lib/`

Utility modules:

| File                  | Purpose                                        |
|-----------------------|------------------------------------------------|
| `logger.ts`           | Winston logger with daily file rotation        |
| `redis.ts`            | Redis client creation with promisified commands|
| `mongoconnect.ts`     | MongoDB connection URI builder                 |
| `date-util.ts`        | Date formatting (Luxon)                        |
| `push/fcm.provider.ts`| Firebase Cloud Messaging provider             |

### `src/jobs/`

Background scheduled tasks:

- `base-job.ts` — Abstract base class with Redis distributed locking (prevents duplicate runs in multi-node deployments)
- `job-scheduler.ts` — Cron-based job scheduler
- `stats-job.ts` — Collects system statistics on a schedule

### `src/cli/`

Command-line tools:

- `makeadmin.ts` — Grant staff privileges to a user
- `makeinvites.ts` — Generate invitation codes
- `db-connect.ts` — Shared MongoDB connection setup for CLI scripts

## Key Architectural Patterns

### Dependency Injection

Controllers and services declare the interfaces they need. Factories wire concrete implementations. This makes unit testing straightforward — tests provide mock objects that satisfy the interfaces without touching the database.

```
Controller ← interface ← adapter object ← Mongoose Model
Service    ← interface ← adapter object ← Mongoose Model
```

### Inline Adapters

Rather than a separate adapter layer, `src/routes/index.ts` and `src/factories/service.factory.ts` create small adapter objects inline that wrap Mongoose models to match controller/service interfaces. This keeps the ORM decoupled from business logic.

### Proxy Architecture

HTTP requests to a user's openHAB are proxied through Socket.IO:

```
HTTP Client
    │
    ▼
Express (routes/middleware.ts identifies target openHAB)
    │
    ▼
Socket.IO emit → openHAB instance (local network)
    │
    ▼
openHAB responds in chunks
    │
    ▼
proxy-handler.ts reassembles → streams back to HTTP client
```

WebSocket connections (`/ws/*`) follow a similar path — the Express HTTP upgrade handler routes them through the same middleware chain, and the proxy handler bridges the WebSocket frames over Socket.IO.

### Connection Locking

`connection-manager.ts` uses Redis to ensure each openHAB UUID is connected to exactly one cloud server node. When an openHAB connects, it acquires a Redis lock. Other nodes redirect proxy requests to the node holding the lock.

### Zod Validation

Request bodies are validated at the route level before reaching controllers:

```typescript
router.post('/login', validateBody(loginSchema), controller.login);
```

Validation schemas live in `src/schemas/index.ts`.

## Request Flow

### Web Pages and API

```
Client Request
    │
    ▼
Express Middleware (body parser, session, CSRF, Passport)
    │
    ▼
Route Match (src/routes/index.ts)
    │
    ▼
Route Guards (ensureAuthenticated, ensureStaff, etc.)
    │
    ▼
Zod Validation (validateBody/validateParams)
    │
    ▼
Controller Method
    │
    ▼
Service (business logic)
    │
    ▼
Repository / Mongoose Model → MongoDB
```

### Proxy (Remote Access)

```
Client Request (remote.host.com/*)
    │
    ▼
URL Rewrite Middleware (prepends /remote)
    │
    ▼
Auth Middleware (Basic or Bearer)
    │
    ▼
setOpenhab Middleware (looks up user's openHAB in Redis/DB)
    │
    ▼
ensureServer Middleware (confirms openHAB is connected)
    │
    ▼
Proxy Route → Socket.IO emit to openHAB
    │
    ▼
openHAB responds → proxy-handler reassembles → HTTP response
```

## Authentication

Four Passport strategies configured in `src/middleware/auth.middleware.ts`:

| Strategy               | Used For                      | Routes              |
|------------------------|-------------------------------|---------------------|
| LocalStrategy          | Web form login                | `POST /login`       |
| BasicStrategy          | HTTP Basic Auth for REST API  | `/api/*`, `/rest/*` |
| BearerStrategy         | OAuth2 bearer tokens          | `/api/*`, `/rest/*` |
| ClientPasswordStrategy | OAuth2 token exchange         | `POST /oauth2/token`|

Session serialization stores the user ID; deserialization loads the full User document from MongoDB.

## Testing

See also [tests/Testing.md](tests/Testing.md) for additional testing documentation.

### Unit Tests

Located in `tests/mocha/unit/`, mirroring the `src/` structure:

```
tests/mocha/unit/
├── controllers/    # Controller tests
├── services/       # Service tests
├── models/         # Model tests
├── routes/         # Route/middleware tests
├── socket/         # Socket module tests
└── lib/            # Utility tests
```

**Pattern:** Import the class under test, create mock implementations of its dependency interfaces, and test behavior.

```typescript
// Example: testing a controller
const mockService = {
  findUser: sinon.stub().resolves({ username: 'test' }),
};
const controller = new MyController(mockService);
// ...assert controller behavior
```

Run with: `npm test`

### Integration Tests

Located in `tests/integration/`, requiring Docker:

```
tests/integration/
├── clients/        # Test clients (OpenHAB simulator, API client)
├── socket/         # WebSocket and proxy tests
├── api/            # REST API tests
├── pages/          # Web page tests
├── concurrent/     # Race condition and load tests
└── helpers/        # Shared test utilities
```

Run with:
```bash
npm run docker:test:up
npm run docker:test:seed
npm run test:integration
npm run docker:test:down
```

## Adding New Code

### New API Endpoint

1. Add a Zod validation schema in `src/schemas/index.ts`
2. Create a controller in `src/controllers/`
3. Add the route in `src/routes/index.ts`
4. Write unit tests in `tests/mocha/unit/controllers/`

### New Business Logic

1. Create a service in `src/services/` with interface-based dependencies
2. Wire it in `src/factories/service.factory.ts`
3. Write unit tests in `tests/mocha/unit/services/`

### New Database Entity

1. Define the TypeScript interface in `src/types/models.ts`
2. Create the Mongoose schema in `src/models/`
3. Export from `src/models/index.ts`
4. Add adapter objects where needed (routes, factories)

### New Background Job

1. Extend `BaseJob` in `src/jobs/`
2. Register the job in `src/app.ts` (or `job-scheduler.ts`)
3. The base class handles Redis distributed locking automatically

### New Middleware

1. Add to `src/middleware/`
2. Import in the appropriate route file (`src/routes/index.ts` or `src/routes/middleware.ts`)

### New CLI Tool

1. Add to `src/cli/`
2. Use `db-connect.ts` for database connection boilerplate
3. Optionally add an npm script in `package.json`

## Configuration Reference

Configuration lives in `config.json` (copy from `docker/config.test.json` for development). The schema is defined in `src/config/schema.ts`.

| Section    | Required | Purpose                                              |
|------------|----------|------------------------------------------------------|
| `system`   | Yes      | Host, port, protocol, logging, subdomain cookies     |
| `express`  | Yes      | Session secret key                                   |
| `mongodb`  | Yes      | Hosts, database name, optional auth                  |
| `redis`    | Yes      | Host, port, optional password                        |
| `mailer`   | No       | SMTP settings for outbound email                     |
| `gcm`      | No       | Firebase Cloud Messaging sender ID and service file  |
| `ifttt`    | No       | IFTTT channel key and test token                     |
| `legal`    | No       | Terms of service and privacy policy URLs             |
| `apps`     | No       | Apple App Store and Google Play Store IDs            |

## Docker & Deployment

### Development / Testing

The `docker/` directory provides test infrastructure:

- `docker-compose.test.yml` — MongoDB, Redis, the app, and nginx
- `Dockerfile.test` — Builds the app image for testing
- `config.test.json` / `config.ci.json` — Test configurations

### Production

The `deployment/docker-compose/` directory contains production templates:

- `docker-compose.yml` — Base Compose file
- `docker-compose.nginx.yml` — nginx variant
- `traefik.yml` — Traefik reverse proxy variant
- `config.json.template` / `config.full.json.template` — Configuration templates
- `nginx.conf.template` — nginx configuration template

See `deployment/docker-compose/README.md` for detailed setup instructions.

## Docker Image Publishing

Docker images are automatically built and pushed to [Docker Hub](https://hub.docker.com/r/openhab/openhab-cloud) via GitHub Actions (`.github/workflows/docker-publish.yml`).

### Setup

Two repository secrets are required (Settings > Secrets and variables > Actions):

- `DOCKER_USER` — Docker Hub username with push access to `openhab/openhab-cloud`
- `DOCKER_TOKEN` — Docker Hub access token

### Tagging Strategy

| Trigger | Tags pushed to Docker Hub |
|---------|--------------------------|
| Push to `main` | `develop`, `develop-<sha>` |
| Push tag `v1.2.3` | `1.2.3`, `1.2`, `latest` |

Pushing to `main` produces a `develop` image. To publish a `latest` release, create a semver tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow runs the full test suite (unit + integration) before building the image.

## License

All TypeScript source files require an EPL-2.0 license header. Run `npm run license:update` to automatically add or update headers across the codebase.
