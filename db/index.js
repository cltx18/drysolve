// Auto-initializes schema + seeds on first load, then re-exports the db handle.
// Safe to call repeatedly (uses CREATE TABLE IF NOT EXISTS).
const db = require('./init');
module.exports = db;
