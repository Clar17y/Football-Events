# Cloud replay checks

These tests run the real frontend data layer, IndexedDB (fake-indexeddb) and sync service
against the backend's actual HTTP routes and Prisma persistence. They register throwaway
accounts, so point them only at a disposable database. They are excluded from `npm test`.

1. Start a disposable PostgreSQL 16 database, for example:
   `docker run -d --rm --name fe-cloud-db -e POSTGRES_PASSWORD=pass -p 127.0.0.1:55432:5432 postgres:16`
2. Create the schema: in `backend`, set `DATABASE_URL=postgresql://postgres:pass@127.0.0.1:55432/postgres`
   and run `npx prisma db push`.
3. Start the backend on port 3001 with the same `DATABASE_URL`, a `JWT_SECRET`, and a high
   `RATE_LIMIT_MAX_REQUESTS` (the checks register many accounts).
4. In `frontend`, run `VITE_API_URL=http://127.0.0.1:3001/api/v1 npm run test:cloud`.
5. Stop the backend and remove the database container.
