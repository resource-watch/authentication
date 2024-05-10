FROM node:20.4-alpine3.18
MAINTAINER info@vizzuality.com

ENV NAME authorization
ENV USER authorization

RUN apk update && apk upgrade && \
    apk add --no-cache --update bash git openssh python3 alpine-sdk

RUN addgroup $USER && adduser -s /bin/bash -D -G $USER $USER

RUN yarn global add --unsafe-perm bunyan

RUN mkdir -p /opt/$NAME
RUN chown -R $USER:$USER /opt/$NAME
USER $USER
WORKDIR /opt/$NAME

COPY package.json yarn.lock ./
RUN yarn --pure-lockfile

COPY entrypoint.sh tsconfig.json ./
COPY config ./config
COPY test ./test
COPY src ./src

# Tell Docker we are going to use this ports
EXPOSE 9000

ENTRYPOINT ["./entrypoint.sh"]
