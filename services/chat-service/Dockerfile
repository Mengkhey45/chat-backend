FROM node:22-alpine

# Install pnpm
RUN corepack enable

WORKDIR /app

# Copy the entire backend directory structure to satisfy TypeScript and pnpm imports
# This is the easiest way when using sibling directories like /shared
COPY package.json pnpm-lock.yaml* ./
COPY shared/ ./shared/
COPY services/chat-service/ ./services/chat-service/

# Go into service dir
WORKDIR /app/services/chat-service

# Install dependencies
# Using --no-frozen-lockfile as the lockfile might change because we're only copying parts of the workspace
RUN pnpm install --no-frozen-lockfile

# Build TypeScript
RUN pnpm run build

EXPOSE 5000
CMD ["pnpm", "start"]
