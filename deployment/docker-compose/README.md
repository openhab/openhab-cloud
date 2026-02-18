# Docker Compose Deployment

Deploy openHAB Cloud using Docker Compose with your choice of reverse proxy.

## Docker Hub

Official images are published to Docker Hub:

**[openhab/openhab-cloud](https://hub.docker.com/r/openhab/openhab-cloud)**

| Tag | Description |
|-----|-------------|
| `latest` | Latest stable release |
| `develop` | Latest development build from main branch |
| `x.y.z` | Specific version (e.g., `1.0.0`) |

```bash
docker pull openhab/openhab-cloud:latest
```

## Architecture

The stack consists of the following services:

| Service | Image | Description |
|---------|-------|-------------|
| `app` | `openhab/openhab-cloud` | Node.js application |
| `mongodb` | `mongo:6` | MongoDB database |
| `redis` | `redis:7-alpine` | Session store and cache |
| `traefik` or `nginx` | varies | Reverse proxy with SSL |

## Prerequisites

- Docker Engine 20+ with Docker Compose V2
- A domain name pointing to your server
- Ports 80 and 443 available

## Quick Start

### Option 1: Traefik (Recommended)

Traefik provides automatic SSL certificate management via Let's Encrypt.

```bash
# 1. Configure environment
cp .env.example .env
nano .env  # Edit with your domain and settings

# 2. Start the stack
docker compose up -d

# 3. View logs
docker compose logs -f app
```

### Option 2: Nginx

Nginx with Certbot for SSL certificate management.

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with your domain and settings

# 2. Get initial SSL certificate
docker compose -f docker-compose.nginx.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  -d your-domain.com --email your@email.com --agree-tos

# 3. Start the stack
docker compose -f docker-compose.nginx.yml up -d
```

## Configuration

### Environment Variables

Edit the `.env` file:

| Variable | Required | Description |
|----------|----------|-------------|
| `DOMAIN_NAME` | Yes | Your domain (e.g., `myopenhab.example.com`) |
| `EMAIL` | Yes | Email for SSL certificate notifications |
| `EXPRESS_KEY` | Yes | Random secret for session encryption |
| `IMAGE_TAG` | No | Docker image tag (default: `latest`) |
| `SMTP_*` | No | Email settings for notifications |
| `MORGAN_FORMAT` | No | HTTP request log format (default: off). Set to `combined`, `short`, etc. |
| `REGISTRATION_ENABLED` | No | Enable user registration (default: `true`) |

### Application Config

The `config.json.template` file is processed at container startup. Environment variables in the template are substituted with values from `.env`.

Two templates are provided:
- `config.json.template` - Basic config (MongoDB, Redis, no push notifications)
- `config.full.json.template` - Full config with email, FCM push, and IFTTT

For production with push notifications, copy the full template:
```bash
cp config.full.json.template config.json.template
```

## Commands

### Start

```bash
# Traefik
docker compose up -d

# Nginx
docker compose -f docker-compose.nginx.yml up -d
```

### Stop

```bash
docker compose down
```

### View Logs

```bash
# All services
docker compose logs -f

# App only
docker compose logs -f app
```

### Update

```bash
# Pull latest images
docker compose pull

# Restart with new images
docker compose up -d
```

### Build from Source

To build the image locally instead of pulling from Docker Hub:

```bash
docker compose build
docker compose up -d
```

### Reset (Remove All Data)

```bash
docker compose down -v
```

## SSL Certificates

### Traefik

Traefik automatically obtains and renews certificates from Let's Encrypt. Certificates are stored in the `traefik-data` volume.

For testing, uncomment the staging server line in `traefik.yml`:
```yaml
# caServer: https://acme-staging-v02.api.letsencrypt.org/directory
```

### Nginx + Certbot

Initial certificate:
```bash
docker compose -f docker-compose.nginx.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  -d your-domain.com --email your@email.com --agree-tos
```

Certificates auto-renew via the certbot container.

Manual renewal:
```bash
docker compose -f docker-compose.nginx.yml run --rm certbot renew
docker compose -f docker-compose.nginx.yml restart nginx
```

## Troubleshooting

### App won't start

Check logs for errors:
```bash
docker compose logs app
```

Common issues:
- MongoDB or Redis not ready - the app waits for healthy services
- Invalid `config.json.template` - check JSON syntax
- Missing environment variables in `.env`

### SSL certificate issues

**Traefik:**
```bash
docker compose logs traefik
```

**Nginx:**
```bash
docker compose -f docker-compose.nginx.yml logs certbot
```

### Database connection issues

Verify MongoDB is healthy:
```bash
docker compose exec mongodb mongosh --eval "db.runCommand({ping:1})"
```

Verify Redis is healthy:
```bash
docker compose exec redis redis-cli ping
```

## Backup

### Database

```bash
# Backup
docker compose exec mongodb mongodump --out /data/backup
docker cp $(docker compose ps -q mongodb):/data/backup ./backup

# Restore
docker cp ./backup $(docker compose ps -q mongodb):/data/backup
docker compose exec mongodb mongorestore /data/backup
```

### Volumes

```bash
# List volumes
docker volume ls | grep openhab-cloud

# Backup a volume
docker run --rm -v openhab-cloud_mongo-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/mongo-data.tar.gz -C /data .
```

## Security Notes

1. **Change the default `EXPRESS_KEY`** - Use a long random string
2. **Disable registration** after creating your account by setting `REGISTRATION_ENABLED=false`
3. **Keep images updated** - Regularly pull new images for security patches
4. **Firewall** - Only expose ports 80 and 443 to the internet
