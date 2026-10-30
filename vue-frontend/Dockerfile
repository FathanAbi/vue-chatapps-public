# Use Node.js LTS
FROM node:22-alpine AS build

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
COPY proxy_params.inc /etc/nginx/proxy_params.inc
# Expose 80 (redirect) and 443 (TLS).
EXPOSE 80 443

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
