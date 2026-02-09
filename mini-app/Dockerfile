# --- Stage 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm install

# API будет проксироваться через nginx → /api/ → backend:8000
ENV VITE_API_BASE_URL=/api/v1

COPY . .
RUN npm run build

# --- Stage 2: Serve ---
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3001

CMD ["nginx", "-g", "daemon off;"]
