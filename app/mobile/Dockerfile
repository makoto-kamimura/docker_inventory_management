FROM node:20-alpine

ENV TZ=Asia/Tokyo \
    EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0 \
    EXPO_NO_TELEMETRY=1

RUN apk add --no-cache git bash libc6-compat tzdata && \
    cp /usr/share/zoneinfo/Asia/Tokyo /etc/localtime

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . /app

EXPOSE 8081 19000 19001 19002

CMD ["npx", "expo", "start", "--tunnel"]
