FROM node:24-slim
WORKDIR /app
COPY package.json ./
COPY . .
ENV NODE_ENV=production PORT=8080 DB_PATH=/data/votes.db TRUST_PROXY=1
EXPOSE 8080
CMD ["node", "--no-warnings", "server.js"]
