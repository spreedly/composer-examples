# syntax=docker/dockerfile:1
#
# INTERIM BUILD. The Composer PHP SDK (spreedly/composer-sdk-server) is not yet
# published to Packagist. We bring its source in through the BuildKit named context
# "sdk" (wired up in ../docker-compose.yml) and install it from that path.
#
# Once the SDK is published, delete the SDK COPY below and let composer.json resolve
# the package from Packagist normally.

FROM php:8.2-cli-bookworm
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends git unzip \
  && rm -rf /var/lib/apt/lists/* \
  && curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
# composer.json depends on the SDK via path: "../../../composer-sdk-server-php".
# Inside the image /app/../../../ collapses to /, so place the SDK source at
# /composer-sdk-server-php for that relative path to resolve.
COPY --from=sdk . /composer-sdk-server-php
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --no-progress
COPY app.php ./
USER www-data
ENV PORT=3022
EXPOSE 3022
CMD php -S 0.0.0.0:${PORT} -t . app.php
