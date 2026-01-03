FROM oven/bun:1-alpine

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Expose port
EXPOSE 3000

# Start server (Bun runs TypeScript directly!)
CMD ["bun", "run", "src/server.ts"]

