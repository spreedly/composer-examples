# syntax=docker/dockerfile:1

FROM golang:1.27-bookworm AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 go build -o sidecar .

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /app/sidecar /app/sidecar
ENV PORT=3024
ENV HOST=0.0.0.0
EXPOSE 3024
USER nonroot
ENTRYPOINT ["/app/sidecar"]
