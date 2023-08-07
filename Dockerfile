FROM node:20.4-alpine3.18
MAINTAINER info@vizzuality.com

ENV NAME authorization
ENV USER authorization

RUN apk update && apk upgrade && \
    apk add --no-cache --update bash git openssh python3 alpine-sdk

RUN addgroup $USER && adduser -s /bin/bash -D -G $USER $USER

RUN yarn global add --unsafe-perm bunyan

RUN mkdir -p /opt/$NAME
COPY package.json /opt/$NAME/package.json
COPY yarn.lock /opt/$NAME/yarn.lock
RUN cd /opt/$NAME && yarn

COPY entrypoint.sh /opt/$NAME/entrypoint.sh
COPY tsconfig.json /opt/$NAME/tsconfig.json
COPY config /opt/$NAME/config
COPY ./src /opt/$NAME/src
COPY ./test opt/$NAME/test

WORKDIR /opt/$NAME

RUN chown -R $USER:$USER /opt/$NAME

# Tell Docker we are going to use this ports
EXPOSE 9000
USER $USER

ENTRYPOINT ["./entrypoint.sh"]
