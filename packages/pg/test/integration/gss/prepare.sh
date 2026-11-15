#!/usr/bin/env bash
set -euo pipefail

mkdir -p /work/deps /work/current /work/before
cp /source/packages/pg/test/integration/gss/fixture-dependencies.json /work/deps/package.json
registry=${NPM_CONFIG_REGISTRY:?Set NPM_CONFIG_REGISTRY to your approved package registry}
npm --prefix /work/deps install --ignore-scripts --no-audit --no-fund \
  --registry="$registry"
npm_config_build_from_source=true npm --prefix /work/deps rebuild kerberos --foreground-scripts

for item in current before; do
  origin=/source
  if [ "$item" = before ]; then origin=/before-source; fi
  (cd "$origin" && tar --exclude=node_modules --exclude=.git -cf - packages/pg packages/pg-protocol) \
    | (cd "/work/$item" && tar -xf -)
  ln -s /work/deps/node_modules "/work/$item/node_modules"
  mkdir -p "/work/$item/packages/pg/node_modules"
  ln -s "/work/$item/packages/pg-protocol" "/work/$item/packages/pg/node_modules/pg-protocol"
  /work/deps/node_modules/.bin/tsc --project "/work/$item/packages/pg-protocol/tsconfig.json"
done

node -e 'const k=require("/work/deps/node_modules/kerberos"); console.log(JSON.stringify({node:process.version,kerberos:k.version,napi:process.versions.napi,platform:process.platform}))'
