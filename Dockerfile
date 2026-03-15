FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# bust cache: 2
# Install all deps (including devDeps for TypeScript build)
COPY package*.json ./
RUN npm ci

# Copy source and build TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Remove dev deps after build
RUN npm prune --omit=dev

# Install Playwright browser
RUN npx playwright install chromium --with-deps

# Persistent data volume for profiles
RUN mkdir -p /data
ENV DATA_DIR=/data

EXPOSE 3000
CMD ["node", "dist/index.js"]
