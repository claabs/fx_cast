#!/bin/sh

set -e

echo "Starting dbus daemon..."
dbus-daemon --system

echo "Starting avahi daemon..."
avahi-daemon --daemonize

echo "Starting fx_cast bridge"
node /usr/app/dist/bridge/src/main.js --daemon --host 0.0.0.0

echo "Exiting..."
