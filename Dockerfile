FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=8080 TRUST_PROXY=1 TURSO_DATABASE_URL=file:/data/votes.db
EXPOSE 8080
CMD ["node", "server.js"]
