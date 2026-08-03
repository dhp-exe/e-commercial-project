# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: Production Build
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy node_modules from deps (only prod dependencies)
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prune devDependencies
RUN npm prune --production

# Create uploads directory and set permissions
RUN mkdir -p src/uploads && chown -R node:node /app

USER node
EXPOSE 5001
CMD ["node", "src/index.js"]
