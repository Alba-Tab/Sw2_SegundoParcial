# Contexto: raíz del repo (para leer contratos/).
FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /src
COPY plataforma/poc/temporal/viajes/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY plataforma/poc/temporal/viajes/src src
COPY contratos/temporal/programar-viaje.schema.json /contratos/programar-viaje.schema.json
RUN mvn -B -ntp package -Dcontrato=/contratos/programar-viaje.schema.json

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /src/target/poc-viajes.jar /src/target/lib/ ./
CMD ["java", "-cp", "/app/*", "poc.viajes.Main"]
