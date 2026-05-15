FROM node:20-alpine AS build

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app
COPY --from=build /app/dist ./dist

EXPOSE 5173

ENV VITE_GATEWAY_URL=http://gateway:3001

CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5173"]
