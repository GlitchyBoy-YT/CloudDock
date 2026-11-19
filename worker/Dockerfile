FROM node:22-alpine
WORKDIR /opt/clouddock-worker
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
USER node
CMD ["node", "src/index.js"]
