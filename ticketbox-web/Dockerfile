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

# CI test stage (Jenkins Test stage):
#   docker build --target test -f ticketbox-web/Dockerfile .
FROM source AS test
RUN pnpm --filter ticketbox-web exec tsc --noEmit
# Runs unit tests and emits LCOV coverage for the SonarQube scanner
# (copied out of this image in the Jenkinsfile's SonarQube Analysis stage).
RUN pnpm --filter ticketbox-web test:coverage

FROM source AS build
RUN pnpm --filter ticketbox-web build

FROM node:22.21.1-alpine3.22 AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN chown node:node /app
COPY --from=build --chown=node:node /workspace/ticketbox-web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/ticketbox-web/.next/static ./ticketbox-web/.next/static
COPY --from=build --chown=node:node /workspace/ticketbox-web/public ./ticketbox-web/public
USER node
EXPOSE 3000
CMD ["node", "ticketbox-web/server.js"]
