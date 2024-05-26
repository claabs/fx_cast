#!/bin/sh

set -e

echo "Starting avahi daemon..."
avahi-daemon --daemonize --no-drop-root

echo "Starting fx_cast bridge"
node /usr/app/dist/bridge/src/main.js --daemon --host 0.0.0.0

echo "Exiting..."
