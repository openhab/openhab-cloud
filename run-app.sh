#!/bin/sh -e

# If config.json.template exists, expand it and overwrite config.json.
# This gives us a chance to customize configs through runtime environment.
if [ -f config.json.template ]; then
  envsubst < config.json.template > config.json
fi

exec node app.js
