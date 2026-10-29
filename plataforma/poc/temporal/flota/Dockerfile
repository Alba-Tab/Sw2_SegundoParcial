# Contexto: raíz del repo (para leer contratos/).
FROM node:24-slim
WORKDIR /app
COPY plataforma/poc/temporal/flota/package.json .
RUN npm install --omit=dev --no-audit --no-fund
COPY plataforma/poc/temporal/flota/src src
COPY contratos/temporal/programar-viaje.schema.json contratos/comun/tipos.schema.json /contratos/
CMD ["node", "src/worker.ts"]
