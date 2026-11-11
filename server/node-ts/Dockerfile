# syntax=docker/dockerfile:1

FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
ENV PORT=3020
ENV HOST=0.0.0.0
EXPOSE 3020
USER node
CMD ["./node_modules/.bin/ts-node", "src/index.ts"]
