FROM node:20-alpine

WORKDIR /app

COPY services/official-account-webhook/package.json services/official-account-webhook/package-lock.json* ./
RUN npm ci --omit=dev

COPY services/official-account-webhook/ ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
