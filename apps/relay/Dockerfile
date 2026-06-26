FROM oven/bun:1.3.11 AS base
WORKDIR /app

FROM base AS runner
ENV NODE_ENV=production

RUN groupadd --system --gid 1001 relay && \
    useradd --system --uid 1001 --gid relay relay

COPY --chown=relay:relay .online-build/relay/index.js /app/index.js

USER relay
WORKDIR /app

EXPOSE 8080
CMD ["bun", "index.js"]
