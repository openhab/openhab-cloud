#!/bin/sh -e

# If config.json.template exists, expand it and overwrite config.json.
# This gives us a chance to customize configs through runtime environment.
# Uses Node.js instead of envsubst to support ${VAR:-default} syntax.
if [ -f config.json.template ]; then
  node -e "
    const fs = require('fs');
    const t = fs.readFileSync('config.json.template', 'utf8');
    const j = t.replace(/\\\$\{(\w+)(?::-(.*?))?\}/g, (_, k, d) => process.env[k] ?? d ?? '');
    try { JSON.parse(j); } catch (e) { console.error('Expanded config.json is not valid JSON:', e.message); console.error(j); process.exit(1); }
    fs.writeFileSync('config.json', j);
  "
fi

exec node dist/app.js
