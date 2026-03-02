# Use full Debian Bookworm (not slim) for better package availability
FROM node:20-bookworm

# Install Chromium (and its dependencies) cleanly
RUN apt-get update && apt-get install -y \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use system Chromium (skip downloading its own)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Install npm dependencies
COPY package*.json ./
RUN npm install

# Copy server code
COPY . .

EXPOSE 8080

CMD ["node", "index.js"]
