# Stage 1: Build the Web App
FROM node:20-alpine AS web-build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# Stage 2: Serve the API and Web App
FROM node:20-alpine
WORKDIR /app/api
COPY api/package*.json ./
RUN npm install
# Copy the api source code
COPY api/ ./
# Copy the built web dist to maintain the expected path for Express: ../../web/dist from /app/api/src
COPY --from=web-build /app/web/dist /app/web/dist

EXPOSE 3000

# Start the Express server
CMD ["npm", "run", "start"]
