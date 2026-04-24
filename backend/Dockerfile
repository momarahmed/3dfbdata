# CrowdSim 3D — Laravel 12 backend (PHP 8.4+ required by Symfony 8 / Laravel 12 lockfile)
FROM php:8.4-cli-alpine

ENV COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_MEMORY_LIMIT=-1

RUN apk add --no-cache \
        bash curl git icu-dev icu-libs libpq-dev oniguruma-dev libzip-dev \
        postgresql-dev autoconf g++ make linux-headers \
    && docker-php-ext-install -j$(nproc) bcmath intl mbstring pcntl pdo pdo_pgsql pgsql zip \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apk del autoconf g++ make linux-headers \
    && rm -rf /var/cache/apk/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

COPY docker/php/crowdsim.ini /usr/local/etc/php/conf.d/crowdsim.ini

WORKDIR /var/www/html

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
