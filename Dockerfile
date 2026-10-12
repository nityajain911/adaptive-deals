# For any container host (Railway, Fly.io, Cloud Run). One instance: state lives in files under ADAPTIVE_DEALS_DATA_DIR.
FROM node:24-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production \
    ADAPTIVE_DEALS_SESSIONS=1 \
    ADAPTIVE_DEALS_DATA_DIR=/tmp/adaptive-deals \
    RAZORPAY_MODE=simulated \
    PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "npm run start -- -p ${PORT}"]
