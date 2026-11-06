# Nether data

Exactly three application tables in Supabase PostgreSQL: calls, cache, outbox.
Python is server-only and stays off the realtime audio path.

See [ADR 0008](../../docs/adr/0008-three-table-python-data-layer.md) for the schema,
trust boundary, production wiring and retention plan. This package is tested locally;
the private `/v1/events` ingestion endpoint now accepts only HMAC-signed server
events. It is not deployed until a Nether Supabase project and private service
identity are configured; the web route remains console-only when its URL/secret
are unset.

```sh
NETHER_DATA_INGEST_SECRET='a-random-secret-at-least-32-chars' \
DATABASE_URL='postgresql://...' \
uv run --project services/data uvicorn nether_data.app:app --host 127.0.0.1 --port 8787
```

```sh
uv sync --frozen
NETHER_TEST_DATABASE_URL='postgresql://localhost:55432/postgres?sslmode=disable' uv run --frozen pytest tests -q
```

Tests create/drop their own random UTF-8 database. The supplied PostgreSQL user
must be a local test administrator. Never pass a production DSN to tests.
