#!/usr/bin/env bash
set -euo pipefail
cd /var/www/html

if [ ! -f "artisan" ]; then
  echo "[entrypoint] ERROR: Laravel artisan not found. Mount the backend/ directory."
  exit 1
fi

if [ ! -d "vendor" ] || [ ! -f "vendor/autoload.php" ]; then
  echo "[entrypoint] composer install..."
  composer install --no-interaction --prefer-dist --optimize-autoloader
fi

if [ ! -f ".env" ]; then
  cp .env.example .env 2>/dev/null || true
fi

# Sync critical env from Docker Compose into .env (container runtime)
for pair in \
  "APP_URL=${APP_URL:-}" \
  "FRONTEND_URL=${FRONTEND_URL:-}" \
  "APP_ENV=${APP_ENV:-local}" \
  "APP_DEBUG=${APP_DEBUG:-true}" \
  "DB_CONNECTION=${DB_CONNECTION:-pgsql}" \
  "DB_HOST=${DB_HOST:-postgres}" \
  "DB_PORT=${DB_PORT:-5432}" \
  "DB_DATABASE=${DB_DATABASE:-crowdsim}" \
  "DB_USERNAME=${DB_USERNAME:-crowdsim}" \
  "DB_PASSWORD=${DB_PASSWORD:-}" \
  "REDIS_HOST=${REDIS_HOST:-redis}" \
  "REDIS_PORT=${REDIS_PORT:-6379}" \
  "CACHE_STORE=${CACHE_STORE:-redis}" \
  "SESSION_DRIVER=${SESSION_DRIVER:-redis}" \
  "QUEUE_CONNECTION=${QUEUE_CONNECTION:-sync}"; do
  key="${pair%%=*}"
  val="${pair#*=}"
  if [ -n "$val" ] && [ -f ".env" ]; then
    if grep -q "^${key}=" .env; then
      sed -i "s|^${key}=.*|${key}=${val}|" .env
    else
      echo "${key}=${val}" >> .env
    fi
  fi
done

if ! grep -q "^APP_KEY=base64:" .env 2>/dev/null; then
  php artisan key:generate --force
fi

rm -f bootstrap/cache/packages.php bootstrap/cache/services.php 2>/dev/null || true
php artisan package:discover --ansi 2>/dev/null || true

echo "[entrypoint] Waiting for Postgres..."
for _ in $(seq 1 60); do
  if php -r "new PDO('pgsql:host=${DB_HOST};port=${DB_PORT};dbname=${DB_DATABASE}','${DB_USERNAME}','${DB_PASSWORD}');" 2>/dev/null; then
    echo "[entrypoint] Postgres OK"
    break
  fi
  sleep 2
done

php artisan migrate --force
php artisan db:seed --force || true

mkdir -p storage/framework/{cache,sessions,views} bootstrap/cache
chmod -R 0777 storage bootstrap/cache 2>/dev/null || true

echo "[entrypoint] Starting: $*"
exec "$@"
