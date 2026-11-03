# Canvases SQLite API (CRUD & History)

> 29 nodes · cohesion 0.11

## Key Concepts

- **ensureDb()** (21 connections) — `src/lib/db/index.ts`
- **db/index.ts** (14 connections) — `src/lib/db/index.ts`
- **[id]/route.ts** (10 connections) — `src/app/api/canvases/[id]/route.ts`
- **history/route.ts** (7 connections) — `src/app/api/canvases/[id]/history/route.ts`
- **reorder/route.ts** (7 connections) — `src/app/api/canvases/reorder/route.ts`
- **clone/route.ts** (6 connections) — `src/app/api/canvases/[id]/clone/route.ts`
- **share/route.ts** (6 connections) — `src/app/api/canvases/[id]/share/route.ts`
- **POST()** (2 connections) — `src/app/api/canvases/[id]/clone/route.ts`
- **GET()** (2 connections) — `src/app/api/canvases/[id]/history/route.ts`
- **POST()** (2 connections) — `src/app/api/canvases/[id]/history/route.ts`
- **DELETE()** (2 connections) — `src/app/api/canvases/[id]/route.ts`
- **GET()** (2 connections) — `src/app/api/canvases/[id]/route.ts`
- **PUT()** (2 connections) — `src/app/api/canvases/[id]/route.ts`
- **GET()** (2 connections) — `src/app/api/canvases/[id]/share/route.ts`
- **PUT()** (2 connections) — `src/app/api/canvases/reorder/route.ts`
- **getDb()** (2 connections) — `src/lib/db/index.ts`
- **initDatabase()** (2 connections) — `src/lib/db/index.ts`
- **src_lib_db_index_instatement** (2 connections)
- **dynamic** (1 connections) — `src/app/api/canvases/[id]/clone/route.ts`
- **runtime** (1 connections) — `src/app/api/canvases/[id]/clone/route.ts`
- **dynamic** (1 connections) — `src/app/api/canvases/[id]/history/route.ts`
- **runtime** (1 connections) — `src/app/api/canvases/[id]/history/route.ts`
- **dynamic** (1 connections) — `src/app/api/canvases/[id]/route.ts`
- **runtime** (1 connections) — `src/app/api/canvases/[id]/route.ts`
- **dynamic** (1 connections) — `src/app/api/canvases/[id]/share/route.ts`
- *... and 4 more nodes in this community*

## Relationships

- [Community 21](Community_21.md) (5 shared connections)
- [Community 58](Community_58.md) (4 shared connections)
- [Community 65](Community_65.md) (3 shared connections)
- [System, Process & LibSQL Storage](System,_Process_&_LibSQL_Storage.md) (3 shared connections)
- [Community 27](Community_27.md) (1 shared connections)

## Source Files

- `src/app/api/canvases/[id]/clone/route.ts`
- `src/app/api/canvases/[id]/history/route.ts`
- `src/app/api/canvases/[id]/route.ts`
- `src/app/api/canvases/[id]/share/route.ts`
- `src/app/api/canvases/reorder/route.ts`
- `src/lib/db/index.ts`

## Audit Trail

- EXTRACTED: 60 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*