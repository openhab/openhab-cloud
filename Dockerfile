FROM node:18-alpine

RUN apk add --no-cache tzdata gettext

RUN addgroup -S openhabcloud && \
    adduser -H -S -G openhabcloud openhabcloud

# Add proper timezone
ARG TZ=Europe/Berlin
RUN ln -s /usr/share/zoneinfo/${TZ} /etc/localtime && \
    echo "${TZ}" > /etc/timezone

WORKDIR /opt/openhabcloud

# Install dependencies (including dev dependencies for build)
COPY package.json package-lock.json ./
RUN apk add --no-cache --virtual .build-deps build-base python3 && \
    npm ci && \
    npm rebuild bcrypt --build-from-source

# Copy source and build TypeScript
COPY . .
RUN npm run build && \
    npm prune --production && \
    apk del .build-deps

# Set up directories and permissions
RUN mkdir -p logs && \
    chown -R openhabcloud:openhabcloud .

USER openhabcloud
EXPOSE 3000
CMD ["./run-app.sh"]
