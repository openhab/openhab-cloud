FROM mhart/alpine-node:7.10.1

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

# We going to use changes to package.json to force Docker not to use the cache
# when we change our app nodejs dependencies:
COPY ./package.json ./config.json /tmp/

RUN cd /tmp && npm install && npm rebuild bcrypt --build-from-source
RUN mkdir -p /opt/openhabcloud && cp -a /tmp/node_modules /opt/openhabcloud

# From here we load our application's code in, therefore the previous docker
# "layer" thats been cached will be used if possible
WORKDIR /opt/openhabcloud

USER openhabcloud

ADD . /opt/openhabcloud

EXPOSE 3000

CMD ["node", "/opt/openhabcloud/app.js"]