module.exports = {
    schema: `CREATE TABLE IF NOT EXISTS traceback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        file_location TEXT NOT NULL,
        node_executable TEXT NOT NULL,
        node_version TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        fixed_at INTEGER NULL,
        ignored_at INTEGER NULL
    );
    CREATE TABLE IF NOT EXISTS stacktrace (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NULL,
        function_name TEXT NULL,
        line_number INTEGER NULL,
        column_number INTEGER NULL,
        source INTEGER NULL,
        created_at INTEGER NOT NULL,
        traceback_id INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS request (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        method TEXT NOT NULL,
        url TEXT NOT NULL,
        params TEXT NULL,
        query TEXT NULL,
        body TEXT NULL,
        traceback_id INTEGER NOT NULL
    );`,
    tracebackList: 'SELECT * FROM traceback ORDER BY created_at DESC LIMIT 10',
    stacktrace: 'SELECT * FROM stacktrace WHERE traceback_id = :traceback_id',
    request: 'SELECT * FROM request WHERE traceback_id = :traceback_id',
    insertTraceback: `INSERT INTO traceback (
        type, message, file_location, node_executable,
        node_version, created_at, fixed_at, ignored_at
    ) VALUES (
        :type, :message, :file_location, :node_executable,
        :node_version, :created_at, :fixed_at, :ignored_at
    );`,
    insertStacktrace: `INSERT INTO stacktrace (
        file_name, function_name, line_number,
        column_number, source, created_at, traceback_id
    ) VALUES (
        :file_name, :function_name, :line_number,
        :column_number, :source, :created_at, :traceback_id
    );`,
    insertRequest: `INSERT INTO request (
        method, url, params, query, body, traceback_id
    ) VALUES (
        :method, :url, :params, :query, :body, :traceback_id
    );`
}
