import { requireAuth } from '~/server/utils/auth-middleware'
import { getDb } from '~/server/utils/db-adapter'

export default defineEventHandler(async (event) => {
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

    // 开启事务，保证扣减配额与插入文件记录的原子性
    await db.prepare('BEGIN').bind().run()
    try {
      // 并发安全的原子扣减：maxStorage=0 视为不限；否则 usedStorage + size <= maxStorage 才能扣减成功
      const upd = await db
        .prepare(`
          UPDATE users
          SET usedStorage = usedStorage + ?
          WHERE id = ?
            AND (maxStorage = 0 OR usedStorage + ? <= maxStorage)
        `)
        .bind(size, user.userId, size)
        .run()

      // 通过受影响行数判断是否扣减成功（若为 0，表示会超限）
      const changes = (upd as any)?.meta?.changes ?? 0
      if (changes !== 1) {
        await db.prepare('ROLLBACK').bind().run()
        throw createError({ statusCode: 403, statusMessage: '存储空间不足，上传该文件将超出配额' })
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