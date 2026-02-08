const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database.');
  }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image_path TEXT,
        caption TEXT,
        hashtags TEXT,
        internal_notes TEXT,
        platforms TEXT,
        platform_settings TEXT,
        scheduled_time TEXT,
        status TEXT DEFAULT 'Pending',
        is_recurring INTEGER DEFAULT 0,
        recurrence_frequency TEXT,
        recurrence_end_date TEXT,
        source_mode TEXT DEFAULT 'Manual'
    )`, (err) => {
    if (err) {
      console.error('Error creating table:', err.message);
    } else {
      // Migration: Add columns if they don't exist (primitive migration)
      const columnsToAdd = [
        'hashtags TEXT',
        'internal_notes TEXT',
        'is_recurring INTEGER DEFAULT 0',
        'recurrence_frequency TEXT',
        'recurrence_end_date TEXT',
        'platform_settings TEXT',
        'source_mode TEXT DEFAULT \'Manual\''
      ];

      columnsToAdd.forEach(col => {
        const colName = col.split(' ')[0];
        db.run(`SELECT ${colName} FROM posts LIMIT 1`, (err) => {
          if (err && err.message.includes('no such column')) {
            console.log(`Migrating: Adding column ${colName}...`);
            db.run(`ALTER TABLE posts ADD COLUMN ${col}`);
          }
        });
      });

      console.log('Connected to SQLite database.');
    }
  });
});

module.exports = db;
