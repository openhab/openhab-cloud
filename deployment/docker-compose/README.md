# Docker Compose

The section describes how the openHAB-cloud docker images can be used with docker-compose
to spin up the dockerized openhab-cloud backend.

## Architecture

The dockerized openhab-cloud uses a separate docker image and container for each part of the overall system
according to the following stack:
* `app`: node.js and express.js (`openhab/openhabcloud-app:latest`)
* `mongodb`: MongoDB database (`mongo:4`)
* `redis`: redis session manager (`bitnami/redis:latest`)
* `traefik`: http proxy with LetsEncrypt SSL Certs (`traefik:1.7`)

## Prerequisites

To run openhab-cloud make sure docker and docker-compose are installed on your machine.
More information at [Docker's website](https://docs.docker.com/).

The `docker-compose.yml` file assume you have ports 80, 443 and 8080 available on the host you intend to run on. If you don't, you'll need to adjust these.

* Port 80 and 443 are public facing ports, serving your openhab-cloud web interface and API endpoints.
  You need to expose them to the public, through port forwarding on your router, or AWS security group, etc.
* Port 8080 is Traefik admin port, for monitoring purposes only. It should NOT be exposed to the public.

## Preparation and customization

1. Prepare the *project directory*. This step depends on if you want to build your own image or use the pre-built image.
   - In order to build your own docker image, you need to clone this entire git repo. Your project directory will be `deployment/docker-compose`.
   - Otherwise, you only need to copy all files from this folder onto the machine that will be hosting your openhab-cloud, and that will be your project directory.
1. Locate the `.env` file in your *project directory*. Follow the comments in the file to substitute all `<...>` tags with real values.
   This file should be kept secret and never published to GitHub.
1. In the `config.json.template` file, update any other settings for openhab-cloud as per the docs.

All commands mentioned hereafter are expected to be issued from your *project directory*.

## Obtain docker images

### Build
To build your own image from source code, potentially with your own modifications, run this command:
```
docker-compose build
```

### Pull
To use pre-built images, download them first with this command:
```
docker-compose pull
```

## Start

To create and run the composed application, run the following command: 
```
docker-compose up -d
```

## Logs

To make sure openhab-cloud is running, check the openhab-cloud app logs:
```
docker-compose logs app
```

## Stop

To stop and remove the openhab-cloud containers, use the following command:
```
docker-compose down
```

After they're stopped, you can restart them by following the steps in the [Start](#start) section again.

## Reset

All application states are persisted in docker volumes, which are not affected by normal stopping and restarts.
If you want to perform a complete reset of your setup, you can remove the docker volumes and images by:
```
docker-compose down -v --rmi all
```

Additionally, you can use this command to cleanup all leftover docker data:
```
docker system prune
```

For more docker-compose commands, please refer to the [official documentation](https://docs.docker.com/compose/gettingstarted/).

## Access

Navigate your browser to ```https://<your-openhab-cloud-host>``` and log in (e.g. https://myopenhab.domain.com). 

If it's the first time you're starting up, make sure you have `registration_enabled` set to `true` in the `config.json.template` file so you can create an initial user login. 

Assuming you don't plan to run an open system, switch this back to `false` once you've registered and restart.

