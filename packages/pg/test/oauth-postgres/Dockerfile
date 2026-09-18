ARG POSTGRES_IMAGE=ghcr.io/railwayapp-templates/postgres-ssl:18@sha256:21c501ce65f9b7de4bc9e4b545a095c00894a10bbf299f37a86e6004a6f7b066

FROM ${POSTGRES_IMAGE} AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libkrb5-dev postgresql-server-dev-18 \
    && rm -rf /var/lib/apt/lists/*

COPY oauth_validator.c /usr/src/oauth-validator/oauth_validator.c
COPY Makefile /usr/src/oauth-validator/Makefile

RUN make -C /usr/src/oauth-validator install

FROM ${POSTGRES_IMAGE}

COPY --from=builder /usr/lib/postgresql/18/lib/oauth_validator.so /usr/lib/postgresql/18/lib/oauth_validator.so
COPY init-oauth.sh /docker-entrypoint-initdb.d/10-init-oauth.sh
