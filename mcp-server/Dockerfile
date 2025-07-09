FROM node:lts-slim
RUN set -eux; \
    apt-get update -y; \
    # Install OpenSSL runtime and Docker dependencies
    apt-get install -y --no-install-recommends openssl libssl3 ca-certificates curl gnupg lsb-release; \
    # Install Docker CLI
    curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg; \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null; \
    apt-get update; \
    apt-get install -y docker-ce-cli; \
    # Install docker-compose
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose; \
    chmod +x /usr/local/bin/docker-compose; \
    # Clean apt cache
    rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app

# Set environment variable to indicate we're running in Docker
ENV DOCKER_CONTAINER=true

COPY package*.json ./
RUN npm install --omit=dev
COPY server.js .
COPY lib/ ./lib/
RUN mkdir -p logs
EXPOSE 9123
CMD ["node", "server.js"]
