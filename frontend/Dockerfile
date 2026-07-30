# EMS frontend — Next.js (standalone output)
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci


FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Baked into the client bundle at build time
ARG NEXT_PUBLIC_API_URL=http://localhost/api
ARG NEXT_PUBLIC_APP_URL=http://localhost
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build


FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

RUN addgroup -S ems && adduser -S ems -G ems

COPY --from=builder /app/public ./public
COPY --from=builder --chown=ems:ems /app/.next/standalone ./
COPY --from=builder --chown=ems:ems /app/.next/static ./.next/static

USER ems

EXPOSE 3000

CMD ["node", "server.js"]
