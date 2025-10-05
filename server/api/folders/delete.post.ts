// server/api/folders/delete.post.ts
import { getMeAndTarget } from '~/server/utils/auth-middleware'
import { getDb } from '~/server/utils/db-adapter'

export default defineEventHandler(async (event) => {
  try {
    const { targetUserId } = await getMeAndTarget(event)
    const userId = Number(targetUserId)
    const db = getDb(event)
    if (!db) throw createError({ statusCode: 500, statusMessage: '数据库连接失败' })

    const { folderId } = await readBody(event)
    const id = Number(folderId)
    if (!Number.isInteger(id) || id < 1) {
      throw createError({ statusCode: 400, statusMessage: '非法的 folderId' })
    }

    // 先校验归属
    const own = await db
      .prepare('SELECT 1 FROM folders WHERE id = ? AND user_id = ?')
      .bind(id, userId)
      .first()
    if (!own) {
      throw createError({ statusCode: 404, statusMessage: '文件夹不存在或无权限' })
    }

    // 递归收集所有后代文件夹ID（含自身）
    const rows: any = await db
      .prepare(`
        WITH RECURSIVE cte(id) AS (
          SELECT id FROM folders WHERE id = ? AND user_id = ?
          UNION ALL
          SELECT f.id FROM folders f
          JOIN cte ON f.parent_id = cte.id
          WHERE f.user_id = ?
        )
        SELECT id FROM cte
      `)
      .bind(id, userId, userId)
      .all()

    const ids: number[] = (rows?.results || []).map((r: any) => Number(r.id)).filter((x: any) => Number.isInteger(x))
    if (ids.length === 0) {
      // 理论上不会发生：至少包含自身
      return { success: true, message: '无需删除' }
    }

    const placeholders = ids.map(() => '?').join(',')

    // 在删除数据库前，先查出待删文件（用于COS删除）
    const filesRes: any = await db
      .prepare(`SELECT id, file_key, filename FROM files WHERE user_id = ? AND folder_id IN (${placeholders})`)
      .bind(userId, ...ids)
      .all()
    const filesToDelete: { id: number; file_key: string; filename?: string }[] =
      (filesRes?.results || []).filter((r: any) => !!r?.file_key)

    // COS 删除（如果配置了密钥且有文件需要删除）
    const config = useRuntimeConfig()
    let cosAttempted = false
    let cosDeleteAll = false

    if (
      filesToDelete.length > 0 &&
      config.tencentSecretId &&
      config.tencentSecretKey &&
      config.tencentSecretId !== 'your_secret_id_here' &&
      config.tencentSecretKey !== 'your_secret_key_here'
    ) {
      cosAttempted = true
      try {
        const COS = (await import('cos-nodejs-sdk-v5')).default
        const cos = new COS({
          SecretId: config.tencentSecretId,
          SecretKey: config.tencentSecretKey,
        })

        const keys = filesToDelete.map((f) => ({ Key: f.file_key }))
        const chunkSize = 1000
        let deletedCount = 0

        for (let i = 0; i < keys.length; i += chunkSize) {
          const batch = keys.slice(i, i + chunkSize)
          // Quiet: true 表示不返回逐个删除结果，若请求出错会直接走 err
          await new Promise((resolve, reject) => {
            cos.deleteMultipleObject(
              {
                Bucket: config.cosBucket,
                Region: config.cosRegion,
                Objects: batch,
                Quiet: true,
              },
              (err: any, data: any) => {
                if (err) {
                  console.error('COS batch delete error:', err)
                  reject(err)
                } else {
                  deletedCount += batch.length
                  resolve(data)
                }
              }
            )
          })
        }

        cosDeleteAll = deletedCount === keys.length
        if (cosDeleteAll) {
          console.log(`Successfully deleted ${deletedCount} file(s) from COS for user ${userId}`)
        } else {
          console.warn(`COS deletion may be partial: ${deletedCount}/${keys.length}`)
        }
      } catch (cosError: any) {
        console.error('Failed to delete files from COS during folder deletion:', cosError)
        cosDeleteAll = false
      }
    }

    // 先删文件，再删文件夹（手动级联）
    await db
      .prepare(`DELETE FROM files WHERE user_id = ? AND folder_id IN (${placeholders})`)
      .bind(userId, ...ids)
      .run()

    await db
      .prepare(`DELETE FROM folders WHERE user_id = ? AND id IN (${placeholders})`)
      .bind(userId, ...ids)
      .run()

    // 重算用户存储用量
    await db
      .prepare(`
        UPDATE users
        SET usedStorage = COALESCE((
          SELECT SUM(file_size) FROM files WHERE user_id = ?
        ), 0)
        WHERE id = ?
      `)
      .bind(userId, userId)
      .run()

    let message = '文件夹及其内容已删除'
    if (cosAttempted && !cosDeleteAll) {
      message = '文件夹及其内容已删除，但COS文件删除可能失败'
    }

    return { success: true, message }
  } catch (error: any) {
    console.error('Delete folder error:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, statusMessage: '删除文件夹失败' })
  }
})