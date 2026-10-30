FROM node:24-slim AS build
WORKDIR /repo/servicios/mcp-server
COPY libs/intercambio-token /repo/libs/intercambio-token
COPY servicios/mcp-server/package.json servicios/mcp-server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY servicios/mcp-server/tsconfig.json servicios/mcp-server/tsconfig.build.json ./
COPY servicios/mcp-server/src src
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/libs/intercambio-token /libs/intercambio-token
COPY --from=build /repo/servicios/mcp-server/node_modules node_modules
COPY --from=build /repo/servicios/mcp-server/dist dist
COPY servicios/mcp-server/package.json ./
USER node
EXPOSE 8106
CMD ["node", "dist/main.js"]
