FROM node:18-alpine
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy backend source
COPY src ./src

# Copy frontend files
COPY frontend ./frontend

EXPOSE 3000

CMD ["node", "src/server.js"]
