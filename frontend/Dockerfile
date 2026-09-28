# Build stage
FROM node:18-alpine AS build

WORKDIR /app

# Add args for environment variables during build
ARG VITE_MAPTILER_API_KEY
ARG VITE_API_URL

ENV VITE_MAPTILER_API_KEY=$VITE_MAPTILER_API_KEY
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Serve stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

# Replace default nginx config to support React Router (SPA)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Add curl for healthcheck
RUN apk add --no-cache curl

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
