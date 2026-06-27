FROM oven/bun:1.3.11 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY .online-build/electric-proxy/server.js ./server.js
EXPOSE 8787
CMD ["bun", "server.js"]
