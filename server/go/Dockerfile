# syntax=docker/dockerfile:1
#
# INTERIM BUILD. The Composer Go SDK (github.com/spreedly/composer-sdk-server-go) is
# not yet published for remote resolution in this example. We bring its source in
# through the BuildKit named context "sdk" (wired up in ../docker-compose.yml) and
# link it via go.mod replace.
#
# Once the SDK is published, delete the SDK COPY below and remove the replace
# directive from go.mod.

FROM golang:1.26-bookworm AS build
WORKDIR /app
# go.mod replace points at ../../../composer-sdk-server-go; inside the image
# /app/../../../ collapses to /, so place the SDK source at /composer-sdk-server-go.
COPY --from=sdk . /composer-sdk-server-go
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 go build -o sidecar .

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /app/sidecar /app/sidecar
ENV PORT=3024
EXPOSE 3024
USER nonroot
ENTRYPOINT ["/app/sidecar"]
