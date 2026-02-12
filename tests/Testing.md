# openHAB-cloud: Testing

## Overview

openHAB-cloud uses TypeScript for all tests with Mocha as the test runner and Chai for assertions.

## Test Structure

```
tests/
├── mocha/unit/           # Unit tests
│   ├── controllers/      # Controller unit tests
│   ├── models/           # Model unit tests
│   ├── services/         # Service unit tests
│   └── socket/           # Socket.IO unit tests
├── integration/          # Integration tests (Docker-based)
│   ├── api/              # REST API tests
│   ├── clients/          # Test client utilities
│   ├── concurrent/       # Load and race condition tests
│   ├── pages/            # Web page tests
│   └── socket/           # WebSocket tests
└── Testing.md
```

## Running Unit Tests

```bash
# Run all unit tests
npm test

# Run with coverage report
npm run test:coverage
```

Coverage reports are generated in the `coverage/` directory.

## Running Integration Tests

Integration tests require a Docker environment with MongoDB, Redis, and the app running.

### Setup

```bash
# Start the Docker test stack
npm run docker:test:up

# Seed the test database
npm run docker:test:seed
```

### Run Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific test suites
npm run test:integration:socket      # WebSocket tests
npm run test:integration:api         # REST API tests
npm run test:integration:pages       # Web page tests
npm run test:integration:concurrent  # Load tests
```

### Cleanup

```bash
# Stop and remove Docker containers
npm run docker:test:down
```

## Test Frameworks

- **Mocha** - Test runner
- **Chai** - Assertion library
- **Sinon** - Mocks and stubs
- **Supertest** - HTTP assertions
- **Cheerio** - HTML parsing for page tests
- **Socket.IO Client** - WebSocket testing
- **nyc (Istanbul)** - Code coverage

## Writing Tests

### Unit Tests

Unit tests should be placed in `tests/mocha/unit/` and follow the naming convention `*.test.ts`.

```typescript
import { expect } from 'chai';
import sinon from 'sinon';

describe('MyModule', () => {
  it('should do something', () => {
    expect(true).to.be.true;
  });
});
```

### Integration Tests

Integration tests use the test clients in `tests/integration/clients/`:

- `OpenHABTestClient` - Simulates an openHAB instance via WebSocket
- `APITestClient` - HTTP client for REST API testing
- `WebTestClient` - Browser-like client for page testing

```typescript
import { OpenHABTestClient, APITestClient } from '../clients';
import { TEST_FIXTURES } from '../seed-database';

describe('My Integration Test', () => {
  let client: OpenHABTestClient;

  beforeEach(async () => {
    client = new OpenHABTestClient(
      'http://localhost:3000',
      TEST_FIXTURES.openhabs.primary.uuid,
      TEST_FIXTURES.openhabs.primary.secret
    );
    await client.connect();
  });

  afterEach(async () => {
    await client.disconnect();
  });

  it('should test something', async () => {
    // Test code
  });
});
```

## Test Credentials

See `tests/integration/seed-database.ts` for test fixture credentials:

- **User**: test@example.com / TestPass123!
- **Staff**: staff@example.com / StaffPass123!
- **OpenHAB**: test-uuid-001 / test-secret-001
