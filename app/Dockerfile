FROM node:20-bookworm-slim
ENV NODE_ENV=production TZ=Asia/Ho_Chi_Minh DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY . .
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3300
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3300/api/stats').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.js"]
