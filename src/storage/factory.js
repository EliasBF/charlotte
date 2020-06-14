const { SqliteStorage } = require('./storages')

class StorageFactory {
    createStorage (options) {
        let storage = null

        if (!/^(sqlite|mysql|mssql|postgres|mongo)$/.test(options.dialect)) {
            throw new Error('Invalid dialect (sqlite|mysql|mssql|postgres|mongo)')
        }

        if (options.dialect === 'sqlite') {
            storage = new SqliteStorage(options)
        }

        return storage
    }
}

module.exports = (options) => {
    const factory = new StorageFactory()
    return factory.createStorage(options)
}
