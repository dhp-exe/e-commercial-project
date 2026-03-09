FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p src/uploads

EXPOSE 5001

CMD ["npm", "start"]
