#!/bin/sh -e

envsubst < config-docker.json > config.json
exec node app.js
