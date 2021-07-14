FROM node:14-alpine

WORKDIR /app
COPY package*.json .

ENV NODE_ENV=production
ENV WORKERLINKS_SECRET=default

RUN npm install -g miniflare

ENTRYPOINT ["miniflare"]
CMD ["index.js -k kv -b WORKERLINKS_SECRET=$WORKERLINKS_SECRET"]
