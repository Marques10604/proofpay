FROM node:20-slim

WORKDIR /app

# Copy root configurations (necessary for workspaces)
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY sdk/package.json ./sdk/

# Install dependencies for all workspaces
RUN npm install

# Copy source code
COPY server/ ./server/
COPY sdk/ ./sdk/

# Build SDK (dependency of server)
RUN npm run build -w sdk

# Build server
RUN npm run build -w server

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start", "-w", "server"]
