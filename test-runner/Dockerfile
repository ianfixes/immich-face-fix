FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /workspace/test-runner

COPY test-runner/package.json ./

RUN npm install --include=dev --no-fund --no-audit
