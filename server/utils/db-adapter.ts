import sqlite3 from 'sqlite3'

// 判断是否为 Cloudflare D1 环境
function isD1(db: any) {
  return db && typeof db.prepare === 'function' && db.constructor?.name === 'D1Database'
}

// 适配器统一接口
export function getDb(event: any) {
  // 优先 Cloudflare D1
  if (isD1(event.context.cloudflare?.env?.DB)) {
    return event.context.cloudflare.env.DB
  }
  // 本地 sqlite3
  if (!global.__sqliteDb) {
    global.__sqliteDb = new sqlite3.Database(process.env.SQLITE_PATH || './data.sqlite')
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