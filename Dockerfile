########
# BASE
########
FROM node:16-alpine as base

WORKDIR /usr/app

RUN apk add --no-cache tini avahi-compat-libdns_sd avahi-dev python3 make g++

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

USER node

ENV NODE_ENV=production NODE_PATH="/usr/app/bridge/node_modules"

ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "/usr/app/dist/bridge/src/main.js", "--daemon", "--host", "0.0.0.0"]