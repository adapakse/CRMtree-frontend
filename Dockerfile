FROM node:20.20.1-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build


EXPOSE 4200

FROM nginx:alpine
    
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]







# # ---------- BUILD STAGE ----------
#     FROM node:20-alpine AS build

#     WORKDIR /app
    
#     COPY package*.json ./
#     RUN npm ci
    
#     COPY . .
#     RUN npm run build
    
#     # ---------- RUNTIME STAGE ----------
#     FROM nginx:alpine
    
#     COPY --from=build /app/dist /usr/share/nginx/html
    
#     EXPOSE 80
    
#     CMD ["nginx", "-g", "daemon off;"]