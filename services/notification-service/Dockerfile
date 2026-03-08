FROM node:20-slim

# Install pnpm
RUN corepack enable

WORKDIR /app

# Copy the required root files and the service directory
COPY package.json pnpm-lock.yaml* ./
COPY shared/ ./shared/
COPY services/notification-service/ ./services/notification-service/

# Go into service dir
WORKDIR /app/services/notification-service

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Build TypeScript
RUN pnpm run build

EXPOSE 7000
CMD ["pnpm", "start"]
