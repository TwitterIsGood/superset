FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3001
ENV SUPERSET_NEXT_DIST_DIR=.next-online

COPY apps/api/.next-online/standalone ./
COPY apps/api/.next-online/static ./apps/api/.next-online/static

EXPOSE 3001
CMD ["node", "apps/api/server.js"]
