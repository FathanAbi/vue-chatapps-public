# Use Node.js LTS
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all project files
COPY . .

# Build the Next.js production build
RUN npm run build

# Expose internal port 3000
EXPOSE 3000

# Start the server using your existing start script
CMD ["npm", "start"]
