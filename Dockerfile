FROM node:20-slim

WORKDIR /app

COPY package.json ./
COPY server/package.json ./server/package.json
COPY client/package.json ./client/package.json

RUN npm --prefix server install --omit=dev \
  && npm --prefix client install

COPY . .

RUN npm --prefix client run build

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["npm", "start"]
