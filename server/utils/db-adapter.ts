import sqlite3 from 'sqlite3'

// 为了避免 TS 报错（可选）
declare global {
  // eslint-disable-next-line no-var
  var __sqliteDb: any
  // eslint-disable-next-line no-var
  var __mysqlPool: any
}

// 判断是否为 Cloudflare D1 环境
function isD1(db: any) {
  return db && typeof db.prepare === 'function' && db.constructor?.name === 'D1Database'
}

// 是否配置了 MySQL
function isMysqlConfigured(config: any) {
  const m = config?.mysql || {}
  return Boolean(
    (m.host && m.user && (m.password !== undefined) && m.database) ||
    config?.mysqlUrl ||
    (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE) ||
    process.env.DATABASE_URL?.startsWith?.('mysql://')
  )
}

// 延迟初始化 MySQL 连接池（动态导入，避免在 CF 环境被打包）
async function getMysqlPool(config: any) {
  if (!global.__mysqlPool) {
    const { createPool } = await import('mysql2/promise')

    let poolOptions: any

    if (config.mysqlUrl || process.env.DATABASE_URL?.startsWith?.('mysql://')) {
      const url = new URL(config.mysqlUrl || process.env.DATABASE_URL!)
      poolOptions = {
        host: url.hostname,
        port: Number(url.port || 3306),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: url.pathname.replace(/^\//, ''),
        waitForConnections: true,
        connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
        queueLimit: 0,
        ssl: process.env.MYSQL_SSL === 'true' ? {} : undefined
      }
    } else {
      const m = config.mysql || {}
      poolOptions = {
        host: m.host || process.env.MYSQL_HOST,
        port: Number(m.port || process.env.MYSQL_PORT || 3306),
        user: m.user || process.env.MYSQL_USER,
        password: m.password ?? process.env.MYSQL_PASSWORD,
        database: m.database || process.env.MYSQL_DATABASE,
        waitForConnections: true,
        connectionLimit: Number(m.connectionLimit || process.env.MYSQL_CONNECTION_LIMIT || 10),
        queueLimit: 0,
        ssl: m.ssl ?? (process.env.MYSQL_SSL === 'true' ? {} : undefined)
      }
    }

    global.__mysqlPool = createPool(poolOptions)
  }
  return global.__mysqlPool
}

// 适配器统一接口
export function getDb(event: any) {
  const config = useRuntimeConfig()
  
  // 优先 Cloudflare D1
  if (isD1(event.context.cloudflare?.env?.DB)) {
    return event.context.cloudflare.env.DB
  }

  // MySQL（mysql2）
  if (isMysqlConfigured(config)) {
    console.log('Using MySQL adapter')
    return {
      prepare(sql: string) {
        return {
          bind(...args: any[]) {
            return {
              async first() {
                const pool = await getMysqlPool(config)
                const [rows] = await pool.query(sql, args)
                return Array.isArray(rows) ? rows[0] : rows
              },
              async all() {
                const pool = await getMysqlPool(config)
                const [rows] = await pool.query(sql, args)
                return { results: Array.isArray(rows) ? rows : [] }
              },
              async run() {
                const pool = await getMysqlPool(config)
                const [result]: any = await pool.query(sql, args)
                // INSERT/UPDATE/DELETE 时 result 为 ResultSetHeader，包含 insertId/affectedRows 等
                return { success: true, meta: result }
              }
            }
          }
        }
      }
    }
  }

  // 本地 sqlite3
  if (!global.__sqliteDb) {
    global.__sqliteDb = new sqlite3.Database(config.dbPath)
  }
  return {
    prepare(sql: string) {
      const db = global.__sqliteDb
      return {
        bind(...args: any[]) {
          return {
            first() {
              return new Promise((resolve, reject) => {
                db.get(sql, args, (err, row) => err ? reject(err) : resolve(row))
              })
            },
            all() {
              return new Promise((resolve, reject) => {
                db.all(sql, args, (err, rows) => err ? reject(err) : resolve({ results: rows }))
              })
            },
            run() {
              return new Promise((resolve, reject) => {
                db.run(sql, args, function (err) {
                  if (err) reject(err)
                  else resolve({ success: true, meta: this })
                })
              })
            }
          }
        }
      }
    }
  }
}