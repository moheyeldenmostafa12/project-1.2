function friendlyDbMessage(err) {
  if (!err) {
    return 'Server error';
  }

  const code = err.code;
  const errno = err.errno;

  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
    return 'Cannot connect to MySQL. Start the database server and check MYSQL_HOST / MYSQL_PORT in .env.';
  }

  if (code === 'ER_ACCESS_DENIED_ERROR' || errno === 1045) {
    return 'MySQL rejected the login. Check MYSQL_USER and MYSQL_PASSWORD in .env.';
  }

  if (code === 'ER_BAD_DB_ERROR' || errno === 1049) {
    return 'Database does not exist. Create it (see .env MYSQL_DATABASE) and import database/schema.sql.';
  }

  if (code === 'ER_NO_SUCH_TABLE' || errno === 1146) {
    return 'Tables are missing. Import database/schema.sql into your MySQL database.';
  }

  if (process.env.NODE_ENV !== 'production') {
    return err.message || String(code || errno || 'Server error');
  }

  return 'Server error';
}

module.exports = { friendlyDbMessage };
