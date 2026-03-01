const { Pool } = require('pg');

class ConfigService {
    constructor() {
        this.cache = {};
        this.isLoaded = false;

        let connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            console.warn('[ConfigService] WARNING: No DATABASE_URL found in environment.');
        }

        this.pool = new Pool({
            connectionString,
            ssl: { rejectUnauthorized: false },
            max: 5, // Keep small for serverless
            idleTimeoutMillis: 30000
        });

        // Suppress pool errors
        this.pool.on('error', (err) => {
            console.error('[ConfigService] PG Pool error:', err.message);
        });
    }

    async loadSettings() {
        console.log('[ConfigService] Loading settings from database pool...');
        try {
            const res = await this.pool.query('SELECT * FROM settings');

            if (res && res.rows) {
                res.rows.forEach(row => {
                    this.cache[row.key] = row.value;
                });
            }

            this.isLoaded = true;
            console.log(`[ConfigService] Loaded ${Object.keys(this.cache).length} settings.`);
        } catch (err) {
            console.error('[ConfigService] Exception loading settings:', err.message);
            // Mark loaded anyway so we don't infinitely retry a dead DB on every page load
            this.isLoaded = true;
        }
    }

    /**
     * Get a configuration value.
     * Prioritizes Database value -> Process Env value -> Default value
     * @param {string} key 
     * @param {string} defaultValue 
     */
    get(key, defaultValue = null) {
        if (this.cache.hasOwnProperty(key)) {
            return this.cache[key];
        }
        return process.env[key] || defaultValue;
    }

    /**
     * Set a configuration value in the database and update cache.
     * @param {string} key 
     * @param {string} value 
     * @param {string} description 
     */
    async set(key, value, description = null) {
        this.cache[key] = value;
        try {
            const upsetQuery = `
                INSERT INTO settings (key, value, description, updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (key) DO UPDATE 
                SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = NOW()
                RETURNING *;
            `;
            const values = [key, value, description || null];
            const res = await this.pool.query(upsetQuery, values);
            return res.rows[0];
        } catch (error) {
            console.error(`[ConfigService] Failed to save setting ${key}:`, error);
            throw error;
        }
    }

    async getAll() {
        if (!this.isLoaded) await this.loadSettings();
        return this.cache;
    }
}

const configService = new ConfigService();
module.exports = configService;
