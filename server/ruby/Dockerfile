# syntax=docker/dockerfile:1

FROM ruby:4.0-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential passwd \
  && rm -rf /var/lib/apt/lists/*
COPY Gemfile Gemfile.lock ./
RUN bundle config set --local without 'development test' && bundle install
COPY app.rb ./
RUN useradd --uid 10001 --create-home sidecar
USER sidecar
ENV PORT=3023
ENV HOST=0.0.0.0
EXPOSE 3023
CMD ["bundle", "exec", "ruby", "app.rb"]
