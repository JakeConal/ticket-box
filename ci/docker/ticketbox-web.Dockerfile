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
# Runs unit tests and emits LCOV coverage for the SonarQube scanner
# (copied out of this image in the Jenkinsfile's SonarQube Analysis stage).
RUN pnpm --filter ticketbox-web test:coverage

FROM test AS build
RUN pnpm --filter ticketbox-web build
