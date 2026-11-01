# Nether data

Exactly three application tables in Supabase PostgreSQL: calls, cache, outbox.
Python is server-only and stays off the realtime audio path.

See [ADR 0008](../../docs/adr/0008-three-table-python-data-layer.md) for the schema,
trust boundary, production wiring and retention plan. This package is tested locally;
it is not deployed or connected to the production event route yet.

```sh
uv sync --frozen
NETHER_TEST_DATABASE_URL='postgresql://localhost:55432/postgres?sslmode=disable' uv run --frozen pytest tests -q
```

Tests create/drop their own random UTF-8 database. The supplied PostgreSQL user
must be a local test administrator. Never pass a production DSN to tests.
