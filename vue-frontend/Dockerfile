# Use Node.js LTS
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies
COPY package*.json ./

RUN npm config set registry https://registry.npmjs.org/
RUN npm install


# Copy source code
COPY . .

# Build for production
RUN npm run build

# Production stage with Nginx
FROM nginx:alpine

# Copy built files from build stage
COPY --from=build /app/dist /usr/share/nginx/html
COPY default.conf /etc/nginx/conf.d/default.conf
# Expose port 80 (mapped to host 50011)
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
