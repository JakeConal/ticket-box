FROM gradle:9-jdk25-alpine AS build
WORKDIR /workspace
COPY settings.gradle build.gradle ./
COPY src ./src
RUN --mount=type=cache,id=ticketbox-gradle,target=/home/gradle/.gradle \
    gradle --no-daemon bootJar

FROM build AS test
RUN --mount=type=cache,id=ticketbox-gradle,target=/home/gradle/.gradle \
    gradle --no-daemon test

FROM eclipse-temurin:25-jre-alpine
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
