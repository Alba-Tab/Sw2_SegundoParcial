# Sensor simulado de combustible (T5.4). Uso: docker compose run --rm simulador-combustible --escenario robo
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY escenarios.mjs simulador.mjs ./
USER node
ENTRYPOINT ["node", "simulador.mjs"]
