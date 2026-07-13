FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build --configuration=production

# Angular's SSR server build bundles express/http-proxy-middleware and everything
# else it needs — no node_modules required at runtime, no nginx either (the
# server itself now serves static assets and proxies /api, replacing nginx's old job).
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/dist/crmtree-frontend ./dist/crmtree-frontend
ENV API_UPSTREAM=https://api.crmtree.pl
ENV PORT=80
EXPOSE 80
CMD ["node", "dist/crmtree-frontend/server/server.mjs"]