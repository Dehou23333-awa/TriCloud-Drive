// save.post.ts
import { getMeAndTarget } from '~/server/utils/auth-middleware'
import { getDb } from '~/server/utils/db-adapter'
import { save } from '~/server/utils/file' // 按你的项目实际路径调整
import {
  userExpiredError,
  userNotFindError,
  dbConnectionError,
  folderNotFindError,
  upload403Error,
} from '~/types/error'

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
    if (input === undefined || input === null || input === '' || input === 'root' || input === '0' || input === 0) return null
    const n = Number(input)
    if (!Number.isInteger(n) || n < 1) throw createError({ statusCode: 400, statusMessage: '非法的 folderId' })
    return n
  }

  try {
    const { targetUserId } = await getMeAndTarget(event)
    const userId = Number(targetUserId)

    const body = await readBody(event)
    const { filename, fileKey, fileSize, fileUrl, contentType, overwrite } = body || {}
    const folderId = normalizeFolderId(body?.folderId ?? (event as any)?.context?.folderId)

    if (!filename || !fileKey || !fileUrl) {
      throw createError({ statusCode: 400, statusMessage: '缺少必要的文件信息' })
    }

    const size = Number(fileSize)
    if (!Number.isFinite(size) || size < 0) {
      throw createError({ statusCode: 400, statusMessage: 'fileSize 参数无效' })
    }

    const db = getDb(event)
    if (!db) throw dbConnectionError

    // 校验用户及文件夹
    const userRow: any = await db.prepare('SELECT expire_at FROM users WHERE id = ?').bind(userId).first()
    if (!userRow) throw userNotFindError
    if (isExpired(userRow.expire_at)) throw userExpiredError

    if (folderId !== null) {
      const chk = await db.prepare('SELECT 1 FROM folders WHERE id = ? AND user_id = ?').bind(folderId, userId).first()
      if (!chk) throw folderNotFindError
    }

    // 开启原子保存点
    await db.prepare('SAVEPOINT upload_tx').bind().run()
    try {
      // 计算 usedStorage 需要预占的增量（覆盖时为差值，新增时为 size）
      let delta = size
      let existedRow: any = null

      if (overwrite === true) {
        if (folderId === null) {
          existedRow = await db
            .prepare('SELECT id, file_size FROM files WHERE user_id = ? AND folder_id IS NULL AND filename = ? LIMIT 1')
            .bind(userId, filename)
            .first()
        } else {
          existedRow = await db
            .prepare('SELECT id, file_size FROM files WHERE user_id = ? AND folder_id = ? AND filename = ? LIMIT 1')
            .bind(userId, folderId, filename)
            .first()
        }
        if (existedRow?.id) {
          const oldSize = Number(existedRow.file_size || 0)
          delta = size - oldSize
        } else {
          delta = size // 覆盖但不存在 => 相当于新增
        }
      }

      // usedStorage 原子预占（含过期与容量校验）
      const upd = await db
        .prepare(`
          UPDATE users
          SET usedStorage = usedStorage + ?
          WHERE id = ?
            AND (maxStorage = 0 OR usedStorage + ? <= maxStorage)
            AND (expire_at IS NULL OR expire_at > ?)
        `)
        .bind(delta, userId, delta, nowSqlString())
        .run()
      const changes = (upd as any)?.meta?.changes ?? 0
      if (changes !== 1) {
        await db.prepare('ROLLBACK TO upload_tx').bind().run()
        await db.prepare('RELEASE upload_tx').bind().run()
        throw upload403Error
      }

      // 委托给 save(...) 完成插入/覆盖（skipIfExist 始终为 false）
      const fileRecord: any = {
        // id 在插入时无意义，仅保持类型兼容
        id: 0,
        folderId: folderId,
        filename,
        fileKey,
        fileSize: size,
        fileUrl,
        contentType: contentType || 'application/octet-stream',
        createdAt: nowSqlString(), // 覆盖时也希望更新为当前时间
      }

      const result = await save(db, fileRecord, userId, folderId, Boolean(overwrite), false)
      if (!result?.success) {
        // save 失败 => 回滚 usedStorage 预占
        await db.prepare('ROLLBACK TO upload_tx').bind().run()
        await db.prepare('RELEASE upload_tx').bind().run()
        throw createError({ statusCode: 500, statusMessage: '保存失败' })
      }

      // 读取落库后的文件（按 file_key 回查；如果你的表对 file_key 唯一，这里更安全）
      let fileRow: any = null
      try {
        fileRow = await db
          .prepare('SELECT * FROM files WHERE user_id = ? AND file_key = ? ORDER BY id DESC LIMIT 1')
          .bind(userId, fileKey)
          .first()
      } catch {}

      await db.prepare('RELEASE upload_tx').bind().run()

      if (overwrite && existedRow?.id) {
        return { success: true, message: '文件覆盖成功', file: fileRow || null }
      }
      return { success: true, message: '文件记录保存成功', file: fileRow || null }
    } catch (txErr) {
      try {
        await db.prepare('ROLLBACK TO upload_tx').bind().run()
        await db.prepare('RELEASE upload_tx').bind().run()
      } catch {}
      throw txErr
    }
  } catch (error: any) {
    console.error('Save file record error:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, statusMessage: '保存文件记录失败' })
  }
})