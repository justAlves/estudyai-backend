FROM oven/bun:1.3.13-alpine

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src

ENV NODE_ENV=production
ENV PORT=3333
EXPOSE 3333

CMD ["bun", "run", "src/index.ts"]
