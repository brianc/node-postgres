FROM node@sha256:0e5f906573693feaa1e21057ebdcfdb5bd5021f050b2dc7c9deceb629c7da2a8

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql krb5-kdc krb5-admin-server krb5-user libkrb5-dev \
    openssh-client openssh-server

WORKDIR /work
