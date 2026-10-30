# Contexto: raíz del repo (libs/intercambio-token y el esquema de contratos/graphql).
FROM node:24-slim AS build
WORKDIR /repo/servicios/gateway
COPY libs/intercambio-token /repo/libs/intercambio-token
COPY servicios/gateway/package.json servicios/gateway/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY servicios/gateway/tsconfig.json servicios/gateway/tsconfig.build.json ./
COPY servicios/gateway/src src
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production ESQUEMA_GRAPHQL=/app/contratos/centro-control.graphql
WORKDIR /app
COPY --from=build /repo/libs/intercambio-token /libs/intercambio-token
COPY --from=build /repo/servicios/gateway/node_modules node_modules
COPY --from=build /repo/servicios/gateway/dist dist
COPY servicios/gateway/package.json ./
COPY contratos/graphql/centro-control.graphql contratos/
USER node
EXPOSE 8105
CMD ["node", "dist/main.js"]
