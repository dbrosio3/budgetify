FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies (production only)
RUN bun install --frozen-lockfile --production=false

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Expose port (Northflank will use this)
EXPOSE 3000

# Start server (Bun runs TypeScript directly!)
CMD ["bun", "run", "src/server.ts"]

