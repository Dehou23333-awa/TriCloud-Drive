// server/api/folders/rename.post.ts
import { defineEventHandler, readBody, createError } from 'h3'
import { getDb } from '~/server/utils/db-adapter'   // 按你的实际路径调整
import { requireAuth } from '~/server/utils/auth-middleware' // 替换为你项目里的鉴权方法

function isUniqueError(err: any) {
  return (
    err?.code === 'SQLITE_CONSTRAINT' ||
    err?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    /UNIQUE/i.test(err?.message || '') ||
    err?.code === 'ER_DUP_ENTRY'
  )
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const userId = user.userId
  const db = getDb(event)

  const body = await readBody<{ folderId: number; newName: string }>(event)
  const folderId = Number(body?.folderId)
  const newName = (body?.newName || '').trim()

  if (!folderId || !newName) {
    throw createError({ statusCode: 400, statusMessage: 'folderId/newName 缺失' })
  }
  if (newName.length > 255) {
    throw createError({ statusCode: 400, statusMessage: '名称过长（最多255字符）' })
  }
  if (/[\\\/]/.test(newName) || newName === '.' || newName === '..') {
    throw createError({ statusCode: 400, statusMessage: '非法的文件夹名称' })
  }

  // 先查归属
  const folder = await db.prepare(`
    SELECT id, user_id AS userId, parent_id AS parentId
    FROM folders WHERE id = ?
  `).bind(folderId).first() as { id: number; userId: number; parentId: number | null } | undefined

  if (!folder) throw createError({ statusCode: 404, statusMessage: '文件夹不存在' })
  if (folder.userId !== userId) throw createError({ statusCode: 403, statusMessage: '无权限' })

  try {
    const result = await db.prepare(`
      UPDATE folders
      SET name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(newName, folderId, userId).run()

    // 统一判断影响行数（D1/sqlite: meta.changes；MySQL: affectedRows）
    const changes = Number(result?.meta?.changes ?? result?.meta?.affectedRows ?? 0)
    // 即使 changes=0（同名或无变化）也当成功返回
    return { success: true }
  } catch (err: any) {
    if (isUniqueError(err)) {
      throw createError({ statusCode: 409, statusMessage: '同一目录下已存在同名文件夹' })
    }
    throw createError({ statusCode: 500, statusMessage: err?.message || '重命名失败' })
  }
})