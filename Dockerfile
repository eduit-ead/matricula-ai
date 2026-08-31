FROM node:20-alpine

WORKDIR /app

COPY V2/package.json V2/package-lock.json ./
RUN npm ci --omit=dev

COPY V2/ ./

ENV NODE_ENV=production
ENV ALLOW_REAL_ENROLLMENTS=false

EXPOSE 3000

CMD ["npm", "start"]
