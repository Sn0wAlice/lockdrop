FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json tailwind.config.js ./
COPY src/ ./src/
COPY public/ ./public/
RUN npx tailwindcss -i public/css/input.css -o public/css/app.css --minify
RUN npx tsc

FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY src/views ./dist/views
RUN mkdir -p uploads

EXPOSE 3000
CMD ["node", "dist/app.js"]
