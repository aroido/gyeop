FROM node:24-bookworm-slim AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . ./

# These values are intentionally public and must be present while Next.js builds.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

RUN pnpm build

FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends haproxy \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/lib ./lib
COPY --from=build /app/scripts/validate-env.mjs ./scripts/validate-env.mjs
COPY ops/render-entrypoint.sh ops/http-boundary/haproxy-origin-wrapper ./ops/

RUN chmod 0755 ./ops/render-entrypoint.sh ./ops/haproxy-origin-wrapper \
  && chown -R node:node /app

USER node

CMD ["./ops/render-entrypoint.sh"]
