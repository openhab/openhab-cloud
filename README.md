# openHAB Cloud

openHAB Cloud is a companion cloud service for [openHAB](https://www.openhab.org/), the open-source home automation platform. It provides:

- **Secure Remote Access** - Access your openHAB instance from anywhere
- **Push Notifications** - Receive notifications on iOS and Android devices
- **OAuth2 Provider** - Enable third-party applications to access openHAB

## Technology Stack

- **Runtime**: Node.js 22+ with TypeScript
- **Web Framework**: Express.js
- **Database**: MongoDB 6+
- **Cache/Sessions**: Redis 7+
- **Real-time**: Socket.IO
- **Reverse Proxy**: Nginx (production)

## Quick Start

### Prerequisites

- Node.js 22 or higher
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

### Proxy hostnames

openHAB Cloud can expose each user's openHAB UI through two separate hostnames, tuned for two different clients:

- **`system.proxyHost`** — the hostname used by the openHAB **mobile apps** (iOS/Android). Unauthenticated requests receive an HTTP `401 WWW-Authenticate: Basic` challenge; the app WebViews intercept that challenge and supply stored credentials automatically. Example: `home.myopenhab.org`.
- **`system.browserProxyHost`** *(optional)* — a hostname intended for **desktop browsers**. Unauthenticated `GET` requests are redirected to `{system.host}/login?returnTo=…` and bounced back to the original URL after sign-in, avoiding the native Basic-auth dialog. Example: `connect.myopenhab.org`.

Both hostnames proxy to the same underlying openHAB instance — only the unauthenticated behavior differs. In `config.json`:

```json
{
  "system": {
    "host": "myopenhab.org",
    "proxyHost": "home.myopenhab.org",
    "browserProxyHost": "connect.myopenhab.org",
    "subDomainCookies": true
  }
}
```

For Docker Compose deployments using `deployment/docker-compose/`, these fields are driven by environment variables via `config.json.template` expansion at container startup. Set them in your `.env` file:

```env
DOMAIN_NAME=myopenhab.org
PROXY_HOST=home.myopenhab.org
BROWSER_PROXY_HOST=connect.myopenhab.org
SUBDOMAIN_COOKIES=true
```

See [deployment/docker-compose/README.md](deployment/docker-compose/README.md) for the full env-var list.

Requirements for the browser flow:

1. `system.host`, `system.proxyHost`, and `system.browserProxyHost` must share a common parent domain (e.g. all under `myopenhab.org`).
2. `system.subDomainCookies` must be enabled (the default) so the session cookie set on `system.host` is also sent to `browserProxyHost`.
3. Each hostname needs its own DNS record and TLS SAN entry at the reverse proxy, all routed to the openHAB Cloud backend.

If `browserProxyHost` is omitted, only `proxyHost` is active and behavior is unchanged from previous releases.

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

See [DEVELOPMENT.md](DEVELOPMENT.md) for the full development guide, including project structure, architecture, all npm scripts, testing, and where to add new code.

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
