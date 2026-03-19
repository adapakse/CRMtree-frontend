FROM node:20.20.1-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
COPY src/proxy.conf-aks.json src/proxy.conf.json
EXPOSE 4200
CMD ["npm", "start"]