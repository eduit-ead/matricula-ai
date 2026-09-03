FROM node:20-alpine
WORKDIR /app
COPY V2/package.json V2/package-lock.json ./
RUN npm install --omit=dev
COPY V2/ ./
ENV PORT=80
EXPOSE 80
CMD ["node", "inscricao-http.js"]
