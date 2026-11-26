// PostgreSQL storage adapter. Same contract as the Blob / file adapters:
//   read(key) -> { data, etag } | null     write(key, data, etag)     create(key, data)     keys(prefix)
// Optimistic concurrency uses a row version (the etag): UPDATE ... WHERE version = $etag, so concurrent writers
// across any number of function instances / database connections cannot overwrite each other.
const TABLE = `CREATE TABLE IF NOT EXISTS sipstreak_documents (
  key text PRIMARY KEY, data jsonb NOT NULL, version bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now())`
// Speeds up prefix scans (users/). A pure optimisation, so engines without text_pattern_ops (e.g. test doubles) may skip it.
const PREFIX_INDEX = `CREATE INDEX IF NOT EXISTS sipstreak_documents_key_prefix ON sipstreak_documents (key text_pattern_ops)`
const conflict = (m) => Object.assign(new Error(m), { code: 'CONFLICT' })

/** @param {{ query: (text: string, params?: unknown[]) => Promise<{ rows: any[], rowCount: number | null }> }} pool */
export async function makePgStore(pool) {
  await pool.query(TABLE)
  await pool.query(PREFIX_INDEX).catch(() => {})
  return {
    async read(key) {
      const r = await pool.query('SELECT data, version FROM sipstreak_documents WHERE key = $1', [key])
      return r.rows[0] ? { data: r.rows[0].data, etag: String(r.rows[0].version) } : null
    },
    async write(key, data, etag) {
      const json = JSON.stringify(data)
      const r = etag
        ? await pool.query('UPDATE sipstreak_documents SET data = $2::jsonb, version = version + 1, updated_at = now() WHERE key = $1 AND version = $3', [key, json, Number(etag)])
        : await pool.query(
            'INSERT INTO sipstreak_documents (key, data) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, version = sipstreak_documents.version + 1, updated_at = now()',
            [key, json])
      if (!r.rowCount) throw conflict('precondition failed')
    },
    async create(key, data) {
      try {
        await pool.query('INSERT INTO sipstreak_documents (key, data) VALUES ($1, $2::jsonb)', [key, JSON.stringify(data)])
      } catch (e) {
        if (e && (e.code === '23505' || /duplicate key|unique/i.test(String(e.message)))) throw conflict('This row already exists')
        throw e
      }
    },
    async keys(prefix) {
      // substring() compares the prefix literally (no LIKE wildcards to escape).
      const r = await pool.query('SELECT key FROM sipstreak_documents WHERE substring(key from 1 for $2::int) = $1::text ORDER BY key', [prefix, prefix.length])
      return r.rows.map((x) => x.key)
    },
  }
}

export async function connectPg(url) {
  const { default: pg } = await import('pg')
  const local = /localhost|127\.0\.0\.1/.test(url)
  const pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000, ssl: local ? undefined : { rejectUnauthorized: false } })
  return makePgStore(pool)
}
