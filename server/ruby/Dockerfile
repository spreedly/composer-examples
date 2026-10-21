# syntax=docker/dockerfile:1
#
# INTERIM BUILD. The Composer Ruby SDK (spreedly-composer-sdk-server) is not yet published
# to RubyGems. We bring its source in through the BuildKit named context "sdk"
# (wired up in ../docker-compose.yml) and install it from that path.
#
# Once the SDK is published, delete the SDK COPY below and replace the path
# dependency in Gemfile with a normal pinned gem version.

FROM ruby:4.0-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential passwd \
  && rm -rf /var/lib/apt/lists/*
# Gemfile depends on the SDK via path: "../../../composer-sdk-server-ruby".
# Inside the image /app/../../../ collapses to /, so place the SDK source at
# /composer-sdk-server-ruby for that relative path to resolve.
COPY --from=sdk . /composer-sdk-server-ruby
COPY Gemfile Gemfile.lock ./
RUN bundle config set --local without 'development test' && bundle install
COPY app.rb ./
RUN useradd --uid 10001 --create-home sidecar
USER sidecar
ENV PORT=3023
ENV HOST=0.0.0.0
EXPOSE 3023
CMD ["bundle", "exec", "ruby", "app.rb"]
