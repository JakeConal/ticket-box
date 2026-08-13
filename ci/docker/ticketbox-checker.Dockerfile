FROM node:22-bullseye AS deps
WORKDIR /workspace
COPY ticketbox-checker/package.json ticketbox-checker/package-lock.json ./
RUN npm ci

FROM deps AS source
COPY ticketbox-checker ./

FROM source AS test
RUN npm test

FROM test AS build
RUN npx expo export --platform web --output-dir dist

FROM nginx:1.29-alpine
COPY --from=build /workspace/dist /usr/share/nginx/html
