# Una imagen para la API (node dist/main.js), el worker (node dist/worker.js) y la carga de la semilla
# (node dist/semilla.js). Contexto: raíz del repo, para copiar plataforma/semilla (D102).
FROM node:24-slim AS build
WORKDIR /app
COPY servicios/flota/package.json servicios/flota/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY servicios/flota/tsconfig.json servicios/flota/tsconfig.build.json ./
COPY servicios/flota/src src
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY servicios/flota/package.json ./
COPY plataforma/semilla semilla/
USER node
EXPOSE 8102
CMD ["node", "dist/main.js"]
