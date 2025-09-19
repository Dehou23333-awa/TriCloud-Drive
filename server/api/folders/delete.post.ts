// server/api/folders/delete.post.ts
import { requireAuth } from '~/server/utils/auth-middleware'
import { getDb } from '~/server/utils/db-adapter'

export default defineEventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
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
      .bind(id, user.userId)
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
      .bind(id, user.userId, user.userId)
      .all()

    const ids: number[] = (rows?.results || []).map((r: any) => Number(r.id)).filter((x: any) => Number.isInteger(x))
    if (ids.length === 0) {
      // 理论上不会发生：至少包含自身
      return { success: true, message: '无需删除' }
    }

    const placeholders = ids.map(() => '?').join(',')

    // 先删文件，再删文件夹（手动级联）
    await db
      .prepare(`DELETE FROM files WHERE user_id = ? AND folder_id IN (${placeholders})`)
      .bind(user.userId, ...ids)
      .run()

    await db
      .prepare(`DELETE FROM folders WHERE user_id = ? AND id IN (${placeholders})`)
      .bind(user.userId, ...ids)
      .run()

    return { success: true, message: '文件夹及其内容已删除' }
  } catch (error: any) {
    console.error('Delete folder error:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, statusMessage: '删除文件夹失败' })
  }
})