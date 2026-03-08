FROM node:20-slim

# Install pnpm
RUN corepack enable

WORKDIR /app

# Copy the required root files and the service directory
COPY package.json pnpm-lock.yaml* ./
COPY shared/ ./shared/
COPY services/auth-service/ ./services/auth-service/

# Go into service dir
WORKDIR /app/services/auth-service

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Build TypeScript
RUN pnpm run build

EXPOSE 4000
CMD ["pnpm", "start"]
