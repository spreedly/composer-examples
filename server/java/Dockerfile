# syntax=docker/dockerfile:1
#
# INTERIM BUILD. The Composer Java SDK (com.spreedly:composer-sdk-server) is
# not yet published to Maven Central. We install it from the BuildKit named context
# "sdk" (wired up in ../docker-compose.yml) before building this sidecar.
#
# Once the SDK is published, delete the SDK install stage and depend on the artifact
# from Maven Central normally.

FROM eclipse-temurin:25-jdk AS sdk-build
COPY --from=sdk . /composer-sdk-server-java
WORKDIR /composer-sdk-server-java
RUN apt-get update \
  && apt-get install -y --no-install-recommends maven \
  && rm -rf /var/lib/apt/lists/* \
  && mvn install -DskipTests -Dgpg.skip=true

FROM eclipse-temurin:25-jdk AS build
WORKDIR /app
COPY --from=sdk-build /root/.m2 /root/.m2
COPY pom.xml ./
COPY src ./src
RUN apt-get update \
  && apt-get install -y --no-install-recommends maven \
  && rm -rf /var/lib/apt/lists/* \
  && mvn -q package -DskipTests -Dgpg.skip=true

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /app/target/java-sidecar-1.0.0.jar /app/sidecar.jar
RUN useradd --uid 10001 --no-create-home sidecar
USER sidecar
ENV PORT=3025
ENV HOST=0.0.0.0
EXPOSE 3025
CMD ["java", "-jar", "/app/sidecar.jar"]
