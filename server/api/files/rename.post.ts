// server/api/files/rename.post.ts
import { defineEventHandler, readBody, createError } from 'h3'
import { getDb } from '~/server/utils/db-adapter'   // 按你的实际路径调整
import { getMeAndTarget } from '~/server/utils/auth-middleware' // 替换为你项目里的鉴权方法

function isUniqueError(err: any) {
  return (
    err?.code === 'SQLITE_CONSTRAINT' ||
    err?.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    /UNIQUE/i.test(err?.message || '') ||
    err?.code === 'ER_DUP_ENTRY'
  )
}

export default defineEventHandler(async (event) => {
  //const user = await requireAuth(event)
  const {targetUserId} = await getMeAndTarget(event)
  const userId = Number(targetUserId)
  const db = getDb(event)

  const body = await readBody<{ fileId: number; newName: string }>(event)
  const fileId = Number(body?.fileId)
  const newName = (body?.newName || '').trim()

  if (!fileId || !newName) {
    throw createError({ statusCode: 400, statusMessage: 'fileId/newName 缺失' })
  }
  if (newName.length > 255) {
    throw createError({ statusCode: 400, statusMessage: '名称过长（最多255字符）' })
  }
  if (/[\\\/]/.test(newName)) {
    throw createError({ statusCode: 400, statusMessage: '文件名不可包含斜杠/反斜杠' })
  }

  // 校验归属
  const file = await db.prepare(`
    SELECT id, user_id AS userId, folder_id AS folderId
    FROM files WHERE id = ?
  `).bind(fileId).first() as { id: number; userId: number; folderId: number | null } | undefined

  if (!file) throw createError({ statusCode: 404, statusMessage: '文件不存在' })
  if (file.userId !== userId) throw createError({ statusCode: 403, statusMessage: '无权限' })

  try {
    const result = await db.prepare(`
      UPDATE files
      SET filename = ?
      WHERE id = ? AND user_id = ?
    `).bind(newName, fileId, userId).run()

    const changes = Number(result?.meta?.changes ?? result?.meta?.affectedRows ?? 0)
    return { success: true }
  } catch (err: any) {
    if (isUniqueError(err)) {
      throw createError({ statusCode: 409, statusMessage: '当前文件夹内已存在同名文件' })
    }
    throw createError({ statusCode: 500, statusMessage: err?.message || '重命名失败' })
  }
})