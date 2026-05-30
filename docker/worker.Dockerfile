FROM node:20-bookworm-slim
WORKDIR /app

ENV NODE_ENV=development

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/db/package.json       packages/db/
COPY packages/shared/package.json   packages/shared/
COPY apps/generator/package.json    apps/generator/

RUN pnpm install --frozen-lockfile

COPY packages/ packages/
COPY apps/generator/ apps/generator/

RUN apt-get update -y && apt-get install -y openssl
RUN pnpm install prisma @prisma/client -w
RUN cd packages/db && pnpm exec prisma generate

CMD ["pnpm", "--filter", "@hana/generator", "start"]
