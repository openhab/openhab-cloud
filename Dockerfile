FROM mhart/alpine-node:8.17

# File Author / Maintainer
MAINTAINER Mehmet Arziman

RUN apk update && \
	apk upgrade && \
	apk add --no-cache build-base && \
	apk add --no-cache python

RUN addgroup -S openhabcloud && \
	adduser -H -S -g openhabcloud openhabcloud
    
# Add proper timezone
RUN apk add --no-cache tzdata && \
	cp /usr/share/zoneinfo/Europe/Berlin /etc/localtime && \
	echo "Europe/Berlin" >  /etc/timezone

# Cleanup container
RUN rm -rf \
    /usr/share/man \
    /tmp/* /var/cache/apk/* \
    /root/.npm \
    /root/.node-gyp \
    /root/.gnupg \
    /usr/lib/node_modules/npm/man \
    /usr/lib/node_modules/npm/doc \
    /usr/lib/node_modules/npm/html \
    /usr/lib/node_modules/npm/scripts

RUN mkdir -p /opt/openhabcloud/logs
RUN mkdir /data

COPY ./package.json /opt/openhabcloud/
RUN ln -s /opt/openhabcloud/package.json /data

WORKDIR /data
ENV NODE_ENV production
RUN npm install --production=true && npm rebuild bcrypt --build-from-source
ENV NODE_PATH /data/node_modules

ADD . /opt/openhabcloud

RUN rm -Rf /opt/openhabcloud/deployment
RUN rm -Rf /opt/openhabcloud/docs
RUN rm -Rf /opt/openhabcloud/tests
RUN rm /opt/openhabcloud/config-development.json
RUN rm /opt/openhabcloud/config-production.json

RUN chown openhabcloud: /opt/openhabcloud/logs

WORKDIR /opt/openhabcloud
USER openhabcloud
EXPOSE 3000
CMD ["node", "app.js"]