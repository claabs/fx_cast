########
# BASE
########
FROM node:16-alpine as base

WORKDIR /usr/app

RUN apk add --no-cache tini avahi avahi-compat-libdns_sd avahi-dev python3 make g++

########
# BUILD
########
FROM base as build

# Copy source code
COPY . .

# Add dev deps
RUN cd bridge && npm ci && npm run build

########
# DEPLOY
########
FROM base as deploy

COPY bridge/package*.json ./bridge/

RUN cd bridge && npm ci --omit=dev

RUN apk del python3 make g++ avahi-dev
# Steal compiled code from build image
COPY --from=build /usr/app/dist dist

COPY entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# backwards compat entrypoint
RUN ln -s /usr/local/bin/docker-entrypoint.sh / \
    && printf "[server]\nenable-dbus=no\n" >> /etc/avahi/avahi-daemon.conf \
    && chmod 777 /etc/avahi/avahi-daemon.conf \
    && mkdir -p /var/run/avahi-daemon \
    && chown avahi:avahi /var/run/avahi-daemon \
    && chmod 777 /var/run/avahi-daemon

USER node

ENV NODE_ENV=production NODE_PATH="/usr/app/bridge/node_modules"

ENTRYPOINT ["tini", "--", "docker-entrypoint.sh"]