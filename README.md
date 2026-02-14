# openHAB Cloud

openHAB Cloud is a companion cloud service for [openHAB](https://www.openhab.org/), the open-source home automation platform. It provides:

- **Secure Remote Access** - Access your openHAB instance from anywhere
- **Push Notifications** - Receive notifications on iOS and Android devices
- **OAuth2 Provider** - Enable third-party applications to access openHAB

## Technology Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Web Framework**: Express.js
- **Database**: MongoDB 6+
- **Cache/Sessions**: Redis 7+
- **Real-time**: Socket.IO
- **Reverse Proxy**: Nginx (production)

## Quick Start

### Prerequisites

- Node.js 18 or higher
- MongoDB 6+
- Redis 7+

### Installation

```bash
# Clone the repository
git clone https://github.com/openhab/openhab-cloud.git
cd openhab-cloud

# Install dependencies
npm install

# Copy and configure settings
cp config-production.json config.json
# Edit config.json with your settings

# Start the server
npm start
```

The server will be available at `http://localhost:3000`.

### Configuration

Edit `config.json` to configure:

- **MongoDB** connection settings
- **Redis** connection settings
- **System** host, port, and protocol
- **Mail** SMTP settings for notifications
- **Push notifications** (Firebase, APNs)
- **OAuth2** client settings

See `config-production.json` for all available options.

## Docker Deployment

### Using Pre-built Image

Official Docker images are available on Docker Hub:

```bash
docker pull openhab/openhab-cloud
```

See [openhab/openhab-cloud](https://hub.docker.com/r/openhab/openhab-cloud) for available tags and usage instructions.

### Using Docker Compose

```bash
# Start all services (MongoDB, Redis, App, Nginx)
docker compose up -d

# View logs
docker compose logs -f
```

See [deployment/docker-compose/README.md](deployment/docker-compose/README.md) for detailed instructions.

## Development

### Running in Development Mode

```bash
# Start dependencies (MongoDB, Redis)
npm run docker:test:up

# Seed test data
npm run docker:test:seed

# Start the app (with hot reload via tsx)
npm start
```

### NPM Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start the server |
| `npm run build` | Compile TypeScript |
| `npm test` | Run unit tests |
| `npm run test:coverage` | Run tests with coverage |
| `npm run test:integration` | Run integration tests |
| `npm run docker:test:up` | Start test Docker stack |
| `npm run docker:test:down` | Stop test Docker stack |
| `npm run deps:audit` | Check for security vulnerabilities |
| `npm run deps:check` | Show all available dependency upgrades |
| `npm run deps:check:minor` | Show only minor/patch upgrades |
| `npm run deps:upgrade:minor` | Update package.json to latest minor versions |

### Testing

See [tests/Testing.md](tests/Testing.md) for detailed testing documentation.

```bash
# Unit tests
npm test

# Integration tests (requires Docker)
npm run docker:test:up
npm run docker:test:seed
npm run test:integration
```

### Dependency Management

Check for security vulnerabilities and outdated packages:

```bash
# Security audit
npm run deps:audit

# See all available upgrades (read-only)
npm run deps:check

# See only minor/patch upgrades (safer)
npm run deps:check:minor

# Apply minor/patch upgrades to package.json
npm run deps:upgrade:minor
npm install
npm test

# Interactive mode — pick which deps to upgrade
npx ncu -i
```

Dependabot is also configured to open weekly PRs for dependency updates.

## Production Deployment

### With Nginx

For production, use Nginx as a reverse proxy:

1. Copy the Nginx config:
   ```bash
   sudo cp etc/nginx_openhabcloud.conf /etc/nginx/sites-available/openhabcloud.conf
   sudo ln -s /etc/nginx/sites-available/openhabcloud.conf /etc/nginx/sites-enabled/
   ```

2. Configure SSL certificates and server name in the config file

3. Restart Nginx:
   ```bash
   sudo systemctl restart nginx
   ```

### With systemd

A systemd service file is provided:

```bash
sudo cp etc/openhabcloud.service /etc/systemd/system/
sudo systemctl enable openhabcloud
sudo systemctl start openhabcloud
```

## CLI Tools

```bash
# Create admin user
npm run cli:makeadmin

# Generate invitation codes
npm run cli:makeinvites
```

## API Documentation

### REST API

- `GET /api/v1/notifications` - Get user notifications
- `POST /api/v1/notifications` - Send a notification
- `GET /api/v1/settings/notifications` - Get notification settings

### WebSocket Events

openHAB instances connect via Socket.IO and communicate using:

- `request` / `response*` - HTTP proxy requests
- `notification` / `broadcastnotification` - Push notifications
- `command` - Item commands

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass: `npm test`
5. Submit a pull request

## License

Eclipse Public License 2.0. See [LICENSE](LICENSE) for details.
