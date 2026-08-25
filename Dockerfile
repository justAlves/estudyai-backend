FROM oven/bun:1.4.0-alpine

WORKDIR /app
COPY package.json bun.lock ./
RUN rm -f bun.lock && bun install --production
RUN apk add --no-cache poppler-utils

COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
ENV PORT=3333
EXPOSE 3333

CMD ["bun", "run", "src/index.ts"]
