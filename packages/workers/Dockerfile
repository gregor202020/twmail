FROM node:22-alpine AS base
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/workers/package.json packages/workers/
# Use full npm install to ensure all hoisted dependencies are installed
RUN npm pkg delete scripts.prepare && npm install

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/workers/ packages/workers/

RUN npm run build --workspace=packages/shared && \
    npm run build --workspace=packages/workers

FROM node:22-alpine
WORKDIR /app

# Copy all node_modules (hoisted deps live at root level)
COPY --from=base /app/node_modules ./node_modules/
COPY --from=base /app/packages/shared/dist ./packages/shared/dist/
COPY --from=base /app/packages/shared/package.json ./packages/shared/
COPY --from=base /app/packages/workers/dist ./packages/workers/dist/
COPY --from=base /app/packages/workers/package.json ./packages/workers/
COPY --from=base /app/package.json ./

# Ensure workspace resolution works for @twmail/shared
RUN mkdir -p node_modules/@twmail && \
    ln -sf /app/packages/shared node_modules/@twmail/shared

ENV NODE_ENV=production
CMD ["node", "packages/workers/dist/index.js"]
