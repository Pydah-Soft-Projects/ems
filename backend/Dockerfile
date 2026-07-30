# EMS backend — Node.js + Express
FROM node:20-alpine AS deps

WORKDIR /app

# bcrypt needs native build tools on Alpine
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev


FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

RUN apk add --no-cache tini \
  && addgroup -S ems && adduser -S ems -G ems

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY app.js ./
COPY src ./src
COPY scripts ./scripts

USER ems

EXPOSE 4000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
