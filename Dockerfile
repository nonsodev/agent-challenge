FROM ollama/ollama:0.7.0

# Set Ollama to bind to all interfaces
ENV OLLAMA_HOST=0.0.0.0


# Disable PostHog telemetry to prevent network errors
ENV POSTHOG_DISABLED=true

# Install system dependencies and Node.js
RUN apt-get update && apt-get install -y \
  curl \
  lsof \
  wait-for-it \
  && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install

# Copy the rest of the application
COPY . .

# Build the project for production
RUN pnpm run build

# Copy and make startup script executable
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Expose ports
EXPOSE 8080

# Environment variables

ENV API_BASE_URL=http://0.0.0.0:11434/api/
ENV MODEL_NAME_AT_ENDPOINT=qwen2.5:1.5b
ENV PORT=8080
ENV DATABASE_URL=file:./mastra.db

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Use exec form for better signal handling
ENTRYPOINT ["/start.sh"]