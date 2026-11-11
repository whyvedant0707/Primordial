#!/bin/bash
set -e
pnpm install --frozen-lockfile
# This product uses optional MongoDB, not the scaffold PostgreSQL package.
# Do not create or mutate a database during a merge.
pnpm run typecheck:libs
