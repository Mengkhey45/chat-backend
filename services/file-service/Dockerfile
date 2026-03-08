FROM node:20-slim

# Install pnpm
RUN corepack enable

WORKDIR /app

# Copy the required root files and the service directory
COPY package.json pnpm-lock.yaml* ./
COPY shared/ ./shared/
COPY services/file-service/ ./services/file-service/

# Go into service dir
WORKDIR /app/services/file-service

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Build TypeScript
RUN pnpm run build

EXPOSE 6000
CMD ["pnpm", "start"]
