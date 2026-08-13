FROM node:22-alpine AS deps
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY ticketbox-web/package.json ./ticketbox-web/package.json
RUN pnpm install --filter ticketbox-web... --frozen-lockfile

FROM deps AS source
COPY ticketbox-web ./ticketbox-web

FROM source AS test
RUN pnpm --filter ticketbox-web exec tsc --noEmit

FROM test AS build
RUN pnpm --filter ticketbox-web build
