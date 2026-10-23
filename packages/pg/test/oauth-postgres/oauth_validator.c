#include "postgres.h"

#include "fmgr.h"
#include "libpq/oauth.h"

PG_MODULE_MAGIC;

static bool
validate_token(const ValidatorModuleState *state, const char *token,
               const char *role, ValidatorModuleResult *result)
{
    result->authorized = strcmp(token, "node-postgres-test-token") == 0;
    result->authn_id = result->authorized ? pstrdup(role) : NULL;
    return true;
}

static const OAuthValidatorCallbacks callbacks = {
    PG_OAUTH_VALIDATOR_MAGIC,
    .validate_cb = validate_token,
};

const OAuthValidatorCallbacks *
_PG_oauth_validator_module_init(void)
{
    return &callbacks;
}
