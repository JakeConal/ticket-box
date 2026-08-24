FROM gradle:9.6.1-jdk25-alpine AS deps
WORKDIR /workspace
RUN chown gradle:gradle /workspace
COPY --chown=gradle:gradle settings.gradle build.gradle ./
COPY --chown=gradle:gradle src ./src
USER gradle

# CI test stage (Jenkins Test stage / ci/docker/ticketbox-api-test.compose.yml,
# which supplies the Redis service the tests need):
#   docker build --target test ./api
FROM deps AS test
CMD ["gradle", "--no-daemon", "test"]

FROM deps AS build
RUN gradle --no-daemon bootJar

FROM eclipse-temurin:25.0.1_8-jre-alpine
WORKDIR /app
RUN addgroup -S ticketbox && adduser -S ticketbox -G ticketbox && chown ticketbox:ticketbox /app
COPY --from=build --chown=ticketbox:ticketbox /workspace/build/libs/*.jar app.jar
USER ticketbox
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
