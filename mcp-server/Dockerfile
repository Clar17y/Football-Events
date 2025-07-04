FROM node:lts-slim
RUN set -eux; \
    apt-get update -y; \
    # Install OpenSSL runtime; Debian 12 provides libssl3
    apt-get install -y --no-install-recommends openssl libssl3 ca-certificates; \
    # Clean apt cache
    rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev
COPY server.js .
EXPOSE 9123
CMD ["node", "server.js"]
