const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const connectionString = process.env.DATABASE_URL;

const realSupabase = createClient(supabaseUrl, supabaseKey);

class SupabasePgPolyfill {
    constructor() {
        if (!connectionString) {
            console.error('SERVER ERROR: Missing DATABASE_URL for Postgres connection.');
        }
        this.pool = new Pool({
            connectionString: connectionString,
            ssl: { rejectUnauthorized: false },
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 3000
        });

        // Use real Supabase for Storage
        this.storage = realSupabase.storage;
    }

    from(table) {
        return new QueryBuilder(this.pool, table);
    }
}

class QueryBuilder {
    constructor(pool, table) {
        this.pool = pool;
        this.table = table;
        this._select = '*';
        this._insert = null;
        this._update = null;
        this._delete = false;
        this._where = [];
        this._order = [];
        this._limit = null;
        this._in = [];
        this._single = false;
        this._upsert = null;
        this._onConflict = 'id';
    }

    select(cols = '*') { this._select = cols; return this; }
    insert(data) { this._insert = Array.isArray(data) ? data : [data]; return this; }
    update(data) { this._update = data; return this; }
    delete() { this._delete = true; return this; }
    upsert(data, options = {}) {
        this._upsert = data;
        if (options.onConflict) this._onConflict = options.onConflict;
        return this;
    }

    eq(column, value) { this._where.push({ col: column, op: '=', val: value }); return this; }
    neq(column, value) { this._where.push({ col: column, op: '!=', val: value }); return this; }
    gt(column, value) { this._where.push({ col: column, op: '>', val: value }); return this; }
    gte(column, value) { this._where.push({ col: column, op: '>=', val: value }); return this; }
    lt(column, value) { this._where.push({ col: column, op: '<', val: value }); return this; }
    lte(column, value) { this._where.push({ col: column, op: '<=', val: value }); return this; }
    in(column, values) { this._in.push({ col: column, vals: values }); return this; }

    order(column, opts = { ascending: true }) {
        this._order.push({ col: column, asc: opts.ascending !== false });
        return this;
    }

    limit(count) { this._limit = count; return this; }
    single() { this._single = true; return this; }

    async _execute() {
        let query = '';
        const values = [];
        let valIdx = 1;

        if (this._insert) {
            const columns = Object.keys(this._insert[0]);
            query = `INSERT INTO "${this.table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES `;

            const rowStrings = [];
            for (const row of this._insert) {
                const rowVals = [];
                for (const col of columns) {
                    rowVals.push(`$${valIdx++}`);
                    values.push(row[col]);
                }
                rowStrings.push(`(${rowVals.join(', ')})`);
            }
            query += rowStrings.join(', ') + ' RETURNING *';

        } else if (this._upsert) {
            const columns = Object.keys(this._upsert[0] || this._upsert);
            const isArray = Array.isArray(this._upsert);
            const rows = isArray ? this._upsert : [this._upsert];

            query = `INSERT INTO "${this.table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES `;

            const rowStrings = [];
            for (const row of rows) {
                const rowVals = [];
                for (const col of columns) {
                    rowVals.push(`$${valIdx++}`);
                    values.push(row[col]);
                }
                rowStrings.push(`(${rowVals.join(', ')})`);
            }

            const updateCols = columns.filter(c => c !== this._onConflict);
            const updateSet = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');

            query += rowStrings.join(', ');
            query += ` ON CONFLICT ("${this._onConflict}") DO UPDATE SET ${updateSet} RETURNING *`;

        } else if (this._update) {
            query = `UPDATE "${this.table}" SET `;
            const updates = [];
            for (const [col, val] of Object.entries(this._update)) {
                updates.push(`"${col}" = $${valIdx++}`);
                values.push(val);
            }
            query += updates.join(', ');
        } else if (this._delete) {
            query = `DELETE FROM "${this.table}"`;
        } else {
            query = `SELECT ${this._select} FROM "${this.table}"`;
        }

        if (!this._insert && !this._upsert && this._where.length > 0) {
            const clauses = [];
            for (const w of this._where) {
                clauses.push(`"${w.col}" ${w.op} $${valIdx++}`);
                values.push(w.val);
            }
            query += ' WHERE ' + clauses.join(' AND ');
        }

        if (!this._insert && !this._upsert && this._in.length > 0) {
            const clauses = [];
            for (const w of this._in) {
                const inParams = w.vals.map(() => `$${valIdx++}`).join(', ');
                clauses.push(`"${w.col}" IN (${inParams})`);
                values.push(...w.vals);
            }
            const prefix = this._where.length > 0 ? ' AND ' : ' WHERE ';
            query += prefix + clauses.join(' AND ');
        }

        if (!this._insert && !this._update && !this._delete && !this._upsert && this._order.length > 0) {
            const orderClauses = this._order.map(o => `"${o.col}" ${o.asc ? 'ASC' : 'DESC'}`);
            query += ' ORDER BY ' + orderClauses.join(', ');
        }

        if (!this._insert && !this._update && !this._delete && !this._upsert) {
            if (this._limit !== null) {
                query += ` LIMIT $${valIdx++}`;
                values.push(this._limit);
            } else if (this._single) {
                query += ` LIMIT 1`;
            }
        }

        if (this._update || this._delete) {
            query += ' RETURNING *';
        }

        let maxRetries = 1;
        let attempt = 0;

        while (attempt <= maxRetries) {
            let client;
            try {
                // Properly check out a client from the pool
                client = await this.pool.connect();
                const res = await client.query(query, values);

                let finalData = res.rows;
                if (this._single && !this._delete && !this._update) {
                    finalData = res.rows.length > 0 ? res.rows[0] : null;
                    if (!finalData && (this._update || this._select !== '*')) {
                        throw new Error('Row not found');
                    }
                } else if (this._single && (this._update || this._insert || this._upsert)) {
                    finalData = res.rows[0];
                }
                return { data: finalData, error: null };
            } catch (error) {
                const isConnectionError = error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || (error.message && error.message.includes('Connection terminated'));

                if (isConnectionError && attempt < maxRetries) {
                    console.warn(`[PG Polyfill] Connection error (${error.code || error.message}). Retrying query checkout...`);
                    attempt++;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }

                console.error(`[PG Polyfill] Query Error on ${this.table}:`, error.message);
                return { data: null, error: { message: error.message, code: error.code } };
            } finally {
                // ALWAYS release the client back to the pool to prevent exhaustion
                if (client) {
                    client.release();
                }
            }
        }
    }

    then(onFulfilled, onRejected) {
        return this._execute().then(onFulfilled, onRejected);
    }
}

const supabase = new SupabasePgPolyfill();
module.exports = supabase;
