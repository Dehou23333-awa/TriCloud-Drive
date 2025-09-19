import { requireAuth } from '~/server/utils/auth-middleware'
import { getDb } from '~/server/utils/db-adapter'

export default defineEventHandler(async (event) => {
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

  function normalizeFolderId(input: any): number | null {
    if (input === undefined || input === null || input === '' || input === 'root' || input === '0' || input === 0) {
      return null
    }
    const n = Number(input)
    if (!Number.isInteger(n) || n < 1) {
      throw createError({ statusCode: 400, statusMessage: '非法的 folderId' })
    }
    return n
  }

  function splitName(filename: string): { base: string, ext: string } {
    const i = filename.lastIndexOf('.')
    if (i <= 0) return { base: filename, ext: '' }
    return { base: filename.slice(0, i), ext: filename.slice(i) }
  }

  function escapeLike(input: string): string {
    return input.replace(/([%_\\])/g, '\\$1')
  }

  function escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  async function resolveUniqueFilename(db: any, userId: number, folderId: number | null, desired: string): Promise<{ name: string, base: string, ext: string, nextN: number }> {
    const { base, ext } = splitName(desired)
    const likePattern = `${escapeLike(base)} (%)${escapeLike(ext)}`
    let rows
    if (folderId === null) {
      rows = await db
        .prepare(`
          SELECT filename FROM files
          WHERE user_id = ? AND folder_id IS NULL
            AND (filename = ? OR filename LIKE ? ESCAPE '\\')
        `)
        .bind(userId, desired, likePattern)
        .all()
    } else {
      rows = await db
        .prepare(`
          SELECT filename FROM files
          WHERE user_id = ? AND folder_id = ?
            AND (filename = ? OR filename LIKE ? ESCAPE '\\')
        `)
        .bind(userId, folderId, desired, likePattern)
        .all()
    }
    const existing = new Set<string>((rows?.results || []).map((r: any) => String(r.filename)))
    if (!existing.has(desired)) {
      return { name: desired, base, ext, nextN: 1 }
    }
    // 找到现有最大 (n)
    const re = new RegExp(`^${escapeRegExp(base)} \\((\\d+)\\)${escapeRegExp(ext)}$`)
    let maxN = 1
    for (const name of existing) {
      const m = name.match(re)
      if (m) {
        const n = parseInt(m[1], 10)
        if (Number.isFinite(n) && n > maxN) maxN = n
      }
    }
    const nextN = maxN + 1
    return { name: `${base} (${nextN})${ext}`, base, ext, nextN }
  }

  function buildName(base: string, ext: string, n: number): string {
    return n <= 1 ? `${base}${ext}` : `${base} (${n})${ext}`
  }

  try {
    const user = await requireAuth(event)
    const { filename, safeFilename, fileKey, fileSize, fileUrl, contentType } = await readBody(event)
    const folderId = normalizeFolderId((await readBody(event))?.folderId ?? (event as any)?.context?.folderId) // 兼容客户端传参

    if (!filename || !fileKey || !fileUrl) {
      throw createError({ statusCode: 400, statusMessage: '缺少必要的文件信息' })
    }

    const size = Number(fileSize)
    if (!Number.isFinite(size) || size <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'fileSize 参数无效' })
    }

    const db = getDb(event)
    if (!db) {
      throw createError({ statusCode: 500, statusMessage: '数据库连接失败' })
    }

    // 上传前过期校验 + folder 归属校验
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
    if (folderId !== null) {
      const chk = await db
        .prepare('SELECT 1 FROM folders WHERE id = ? AND user_id = ?')
        .bind(folderId, user.userId)
        .first()
      if (!chk) {
        throw createError({ statusCode: 404, statusMessage: '文件夹不存在或无权限' })
      }
    }

    // 使用 SAVEPOINT，兼容可能已存在的外层事务
    await db.prepare('SAVEPOINT upload_tx').bind().run()
    try {
      // 计算不重名的文件名
      let { name: finalName, base, ext, nextN } = await resolveUniqueFilename(db, user.userId, folderId, filename)

      // 并发安全扣减配额（并校验未过期）
      const upd = await db
        .prepare(`
          UPDATE users
          SET usedStorage = usedStorage + ?
          WHERE id = ?
            AND (maxStorage = 0 OR usedStorage + ? <= maxStorage)
            AND (expire_at IS NULL OR expire_at > ?)
        `)
        .bind(size, user.userId, size, nowSqlString()).run()

      const changes = (upd as any)?.meta?.changes ?? 0
      if (changes !== 1) {
        await db.prepare('ROLLBACK TO upload_tx').bind().run()
        await db.prepare('RELEASE upload_tx').bind().run()
        throw createError({ statusCode: 403, statusMessage: '存储空间不足或账号已过期，禁止上传' })
      }

      // 插入文件记录（若并发导致重名，再自增后重试）
      let file: any | null = null
      const maxRetry = 10
      for (let attempt = 0; attempt < maxRetry; attempt++) {
        try {
          file = await db
            .prepare(`
              INSERT INTO files (user_id, folder_id, filename, file_key, file_size, file_url, content_type)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              RETURNING *
            `)
            .bind(
              user.userId,
              folderId,                   // 允许 null 表示根目录
              finalName,                  // 显示名，确保同目录下唯一
              fileKey,
              size,
              fileUrl,
              contentType || 'application/octet-stream'
            )
            .first()
          break
        } catch (e: any) {
          const msg = String(e?.message || e)
          // 唯一约束失败（同一文件夹重名）
          if (msg.includes('UNIQUE') && msg.includes('files')) {
            nextN += 1
            finalName = buildName(base, ext, nextN)
            continue
          }
          // 其他错误：回滚并抛出
          await db.prepare('ROLLBACK TO upload_tx').bind().run()
          await db.prepare('RELEASE upload_tx').bind().run()
          throw e
        }
      }

      if (!file) {
        await db.prepare('ROLLBACK TO upload_tx').bind().run()
        await db.prepare('RELEASE upload_tx').bind().run()
        throw createError({ statusCode: 500, statusMessage: '保存失败：重名重试次数过多' })
      }

      await db.prepare('RELEASE upload_tx').bind().run()

      return {
        success: true,
        message: '文件记录保存成功',
        file
      }
    } catch (txErr) {
      try {
        await db.prepare('ROLLBACK TO upload_tx').bind().run()
        await db.prepare('RELEASE upload_tx').bind().run()
      } catch (_) {}
      throw txErr
    }
  } catch (error: any) {
    console.error('Save file record error:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, statusMessage: '保存文件记录失败' })
  }
})