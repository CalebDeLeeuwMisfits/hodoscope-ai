FROM node:20-alpine

WORKDIR /app
RUN npm install serve@14

COPY dist/index.html /app/index.html
COPY dist/favicon.ico /app/favicon.ico
COPY dist/favicon.svg /app/favicon.svg
COPY dist/apple-touch-icon.png /app/apple-touch-icon.png
COPY dist/apple-touch-icon-precomposed.png /app/apple-touch-icon-precomposed.png

EXPOSE 8080
CMD ["npx", "serve", ".", "-s", "-l", "8080"]
