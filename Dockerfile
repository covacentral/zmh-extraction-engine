# Multi-stage lightweight Dockerfile for ZMH WhatsApp Bot on Google Cloud Run
FROM node:20-alpine AS runner

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY server.js ./
COPY services/ ./services/

# Cloud Run injects PORT environment variable (defaults to 8080)
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "server.js"]
