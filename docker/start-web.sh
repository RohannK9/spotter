#!/bin/sh
set -eu
exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT:-8000}" \
  --workers "${WEB_CONCURRENCY:-2}" --threads 4 --timeout 150 --graceful-timeout 30 \
  --error-logfile -
