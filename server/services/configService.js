const supabase = require('../supabaseClient');

class ConfigService {
    constructor() {
        this.cache = {};
        this.isLoaded = false;
    }

    async loadSettings() {
        console.log('[ConfigService] Loading settings from database...');
        const { data, error } = await supabase
            .from('settings')
            .select('*');

        if (error) {
            console.error('[ConfigService] Failed to load settings:', error);
            return;
        }

        if (data) {
            data.forEach(row => {
                this.cache[row.key] = row.value;
            });
        }

        this.isLoaded = true;
        console.log(`[ConfigService] Loaded ${Object.keys(this.cache).length} settings.`);
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
        // Update Cache immediately for responsiveness
        this.cache[key] = value;

        const upsetData = {
            key,
            value,
            updated_at: new Date()
        };

        if (description) {
            upsetData.description = description;
        }

        const { data, error } = await supabase
            .from('settings')
            .upsert(upsetData)
            .select()
            .single();

        if (error) {
            console.error(`[ConfigService] Failed to save setting ${key}:`, error);
            throw error;
        }

        return data;
    }

    async getAll() {
        if (!this.isLoaded) await this.loadSettings();
        return this.cache;
    }
}

const configService = new ConfigService();
module.exports = configService;
