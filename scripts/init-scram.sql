-- Bootstraps a SCRAM-SHA-256 test user that the integration suite expects
-- (mirrors the CI workflow at .github/workflows/ci.yml).
--
-- Loaded automatically by the postgres image's docker-entrypoint-initdb.d
-- mechanism on first container start.

SET password_encryption = 'scram-sha-256';
CREATE ROLE scram_test LOGIN PASSWORD 'test4scram';
