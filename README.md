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
