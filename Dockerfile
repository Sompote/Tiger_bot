FROM node:20-bookworm-slim

ENV NODE_ENV=production
ENV TIGER_HOME=/home/node/.tiger

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY bin ./bin
COPY src ./src
COPY scripts ./scripts
COPY LICENSE README.md .env.example .env.secrets.example ./

RUN mkdir -p "${TIGER_HOME}/data" "${TIGER_HOME}/db" "${TIGER_HOME}/logs" \
  && chown -R node:node /app /home/node

USER node

ENTRYPOINT ["node", "bin/tiger.js"]
CMD ["start"]
