FROM gradle:9.6.1-jdk25-alpine AS build
WORKDIR /workspace
RUN chown gradle:gradle /workspace
COPY --chown=gradle:gradle settings.gradle build.gradle ./
COPY --chown=gradle:gradle src ./src
USER gradle
RUN gradle --no-daemon bootJar

FROM eclipse-temurin:25.0.1_8-jre-alpine
WORKDIR /app
RUN addgroup -S ticketbox && adduser -S ticketbox -G ticketbox && chown ticketbox:ticketbox /app
COPY --from=build --chown=ticketbox:ticketbox /workspace/build/libs/*.jar app.jar
USER ticketbox
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
