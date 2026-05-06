FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install runtime dependencies only
RUN bun install --frozen-lockfile --production

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Expose port for the container runtime
EXPOSE 3000

# Start server (Bun runs TypeScript directly!)
CMD ["bun", "run", "src/server.ts"]
