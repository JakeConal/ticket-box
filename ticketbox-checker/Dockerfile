FROM node:22.21.1-bullseye AS deps
WORKDIR /workspace
RUN chown node:node /workspace
COPY --chown=node:node package.json package-lock.json ./
USER node
RUN npm ci --ignore-scripts

FROM deps AS source
COPY --chown=node:node . ./

# CI test stage (Jenkins Test stage):
#   docker build --target test ./ticketbox-checker
FROM source AS test
RUN npm test

FROM source AS build
RUN ./node_modules/.bin/expo export --platform web --output-dir dist

FROM nginxinc/nginx-unprivileged:1.31.3-alpine
COPY --from=build /workspace/dist /usr/share/nginx/html
EXPOSE 8080
