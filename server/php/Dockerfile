# syntax=docker/dockerfile:1

FROM php:8.2-cli-bookworm
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends git unzip \
  && rm -rf /var/lib/apt/lists/* \
  && curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --no-progress
COPY app.php ./
USER www-data
ENV PORT=3022
EXPOSE 3022
CMD php -S 0.0.0.0:${PORT} -t . app.php
