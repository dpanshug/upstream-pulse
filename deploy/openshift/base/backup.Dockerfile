FROM postgres:16-alpine
RUN apk upgrade --no-cache && apk add --no-cache aws-cli
