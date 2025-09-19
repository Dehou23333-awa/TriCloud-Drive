import { requireAuth } from '~/server/utils/auth-middleware'
import { getDb } from '~/server/utils/db-adapter'

export default defineEventHandler(async (event) => {
  // 解析 SQL 时间字符串（形如 2026-12-31 11:20:28）；无法解析时返回 null
  function parseSqlDateTime(input: any): Date | null {
    if (!input) return null
    if (input instanceof Date) return input
    if (typeof input === 'number') {
      const d = new Date(input)
      return isNaN(d.getTime()) ? null : d
    }
    const s = String(input).trim()
    if (!s) return null
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/)
    if (m) {
      const y = parseInt(m[1], 10)
      const mo = parseInt(m[2], 10)
      const d = parseInt(m[3], 10)
      const h = parseInt(m[4], 10)
      const mi = parseInt(m[5], 10)
      const se = parseInt(m[6], 10)
      const dt = new Date(y, mo - 1, d, h, mi, se)
      return isNaN(dt.getTime()) ? null : dt
    }
    const dt = new Date(s.replace(' ', 'T'))
    return isNaN(dt.getTime()) ? null : dt
  }

  function isExpired(expireAt: any): boolean {
    const dt = parseSqlDateTime(expireAt)
    if (!dt) return false
    return Date.now() >= dt.getTime()
  }

  // 格式化当前时间为 'YYYY-MM-DD HH:mm:ss'（用于 SQL 文本比较）
  function nowSqlString(): string {
    const now = new Date()
    const Y = now.getFullYear()
    const M = String(now.getMonth() + 1).padStart(2, '0')
    const D = String(now.getDate()).padStart(2, '0')
    const h = String(now.getHours()).padStart(2, '0')
    const m = String(now.getMinutes()).padStart(2, '0')
    const s = String(now.getSeconds()).padStart(2, '0')
    return `${Y}-${M}-${D} ${h}:${m}:${s}`
  }

  try {
    const user = await requireAuth(event)

    const { filename, safeFilename, fileKey, fileSize, fileUrl, contentType } = await readBody(event)

    if (!filename || !fileKey || !fileUrl) {
      throw createError({ statusCode: 400, statusMessage: '缺少必要的文件信息' })
    }

    // 以服务端为准的 size 校验（仍建议在这里用 COS HEAD 获取真实大小，见文末“可选校验”）
    const size = Number(fileSize)
    if (!Number.isFinite(size) || size <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'fileSize 参数无效' })
    }

    const db = getDb(event)
    if (!db) {
      throw createError({ statusCode: 500, statusMessage: '数据库连接失败' })
    }

    // 新增：上传前的过期校验
    const userRow: any = await db
      .prepare('SELECT expire_at FROM users WHERE id = ?')
      .bind(user.userId)
      .first()

    if (!userRow) {
      throw createError({ statusCode: 404, statusMessage: '用户不存在或已被删除' })
    }
    if (isExpired(userRow.expire_at)) {
      throw createError({ statusCode: 403, statusMessage: '账号已过期，禁止上传' })
    }

    // 开启事务，保证扣减配额与插入文件记录的原子性
    await db.prepare('BEGIN').bind().run()
    try {
      // 并发安全的原子扣减：增加过期校验（expire_at 为空表示不过期）
      const upd = await db
        .prepare(`
          UPDATE users
          SET usedStorage = usedStorage + ?
          WHERE id = ?
            AND (maxStorage = 0 OR usedStorage + ? <= maxStorage)
            AND (expire_at IS NULL OR expire_at > ?)
        `)
        .bind(size, user.userId, size, nowSqlString())
        .run()

      // 通过受影响行数判断是否扣减成功（若为 0，表示会超限或账号已过期）
      const changes = (upd as any)?.meta?.changes ?? 0
      if (changes !== 1) {
        await db.prepare('ROLLBACK').bind().run()
        // 二次确认原因（可选）：这里简单返回统一文案，也可以再查一次判断究竟是超限还是过期
        throw createError({ statusCode: 403, statusMessage: '存储空间不足或账号已过期，禁止上传' })
      }

      // 插入文件记录（file_size 用服务端确认的 size）
      const file = await db
        .prepare(`
          INSERT INTO files (user_id, filename, file_key, file_size, file_url, content_type)
          VALUES (?, ?, ?, ?, ?, ?)
          RETURNING *
        `)
        .bind(
          user.userId,
          filename,
          fileKey,
          size,
          fileUrl,
          contentType || 'application/octet-stream'
        )
        .first()

      await db.prepare('COMMIT').bind().run()

      return {
        success: true,
        message: '文件记录保存成功',
        file
      }
    } catch (txErr) {
      // 事务内出错则回滚
      try { await db.prepare('ROLLBACK').bind().run() } catch (e) {}
      throw txErr
    }
  } catch (error: any) {
    console.error('Save file record error:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, statusMessage: '保存文件记录失败' })
  }
})