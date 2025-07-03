FROM node:lts-slim
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev
COPY server.js .
EXPOSE 9123
CMD ["node", "server.js"]
