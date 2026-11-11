FROM node:16-alpine

ENV NODE_ENV production

WORKDIR /home/node

RUN apk add --no-cache python3 make g++

ENV PYTHON=/usr/bin/python3

COPY --chown=node:node . .

USER node

RUN npm i

CMD ["npm", "run", "bot"]