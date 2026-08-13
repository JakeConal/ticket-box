FROM node:22.21.1-alpine3.22 AS deps
WORKDIR /workspace
RUN corepack enable
RUN chown node:node /workspace
COPY --chown=node:node package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --chown=node:node ticketbox-web/package.json ./ticketbox-web/package.json
USER node
RUN pnpm install --filter ticketbox-web... --frozen-lockfile --ignore-scripts

FROM deps AS source
COPY --chown=node:node ticketbox-web ./ticketbox-web

FROM source AS test
RUN pnpm --filter ticketbox-web exec tsc --noEmit

FROM test AS build
RUN pnpm --filter ticketbox-web build
