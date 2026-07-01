FROM node:22-alpine AS deps
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY ticketbox-web/package.json ./ticketbox-web/package.json
RUN pnpm install --filter ticketbox-web... --frozen-lockfile

FROM deps AS build
WORKDIR /workspace
COPY ticketbox-web ./ticketbox-web
RUN pnpm --filter ticketbox-web build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/ticketbox-web/.next/standalone ./
COPY --from=build /workspace/ticketbox-web/.next/static ./ticketbox-web/.next/static
COPY --from=build /workspace/ticketbox-web/public ./ticketbox-web/public
EXPOSE 3000
CMD ["node", "ticketbox-web/server.js"]
