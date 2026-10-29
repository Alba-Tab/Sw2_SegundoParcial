# Contexto: raíz del repo (las interfaces REST se generan desde contratos/openapi/viajes.yaml en el build).
# Imagen amd64 y arm64 (N11: la nube usa amd64).
FROM eclipse-temurin:25-jdk AS build
WORKDIR /src/servicios/viajes
COPY servicios/viajes/.mvn .mvn
COPY servicios/viajes/mvnw servicios/viajes/pom.xml ./
RUN ./mvnw -q -B dependency:go-offline
COPY contratos/openapi /src/contratos/openapi
COPY servicios/viajes/src src
RUN ./mvnw -q -B -DskipTests package && java -Djarmode=tools -jar target/viajes-*.jar extract --layers --launcher --destination target/capas

FROM eclipse-temurin:25-jre
WORKDIR /app
RUN useradd --system --uid 10001 viajes
COPY --from=build /src/servicios/viajes/target/capas/dependencies/ ./
COPY --from=build /src/servicios/viajes/target/capas/spring-boot-loader/ ./
COPY --from=build /src/servicios/viajes/target/capas/snapshot-dependencies/ ./
COPY --from=build /src/servicios/viajes/target/capas/application/ ./
USER viajes
EXPOSE 8101
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "org.springframework.boot.loader.launch.JarLauncher"]
