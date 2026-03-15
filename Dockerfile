FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Install Playwright browser
RUN npx playwright install chromium --with-deps

COPY dist/ ./dist/

# Persistent data volume for profiles
RUN mkdir -p /data
ENV DATA_DIR=/data

EXPOSE 3000
CMD ["node", "dist/index.js"]
