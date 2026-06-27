FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV SUPERSET_NEXT_DIST_DIR=.next-online

COPY apps/web/.next-online/standalone ./
COPY apps/web/.next-online/static ./apps/web/.next-online/static
COPY apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
