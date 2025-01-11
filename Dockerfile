# Base image
FROM node:18-alpine
RUN apk add --no-cache libc6-compat git openssl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm i --legacy-peer-deps
RUN npx prisma generate

RUN npm install -g dotenv-cli

# Copy project files including .env.production
COPY . .

# Ensure we're using production environment
ENV NODE_ENV=production

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start:production"]