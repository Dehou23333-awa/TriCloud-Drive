// server/api/manage/updateUser.post.ts
import { getMethod, readBody } from 'h3'
import { getDb } from '~/server/utils/db-adapter'

export default defineEventHandler(async (event) => {
  if (getMethod(event) !== 'POST') {
    throw createError({ statusCode: 405, statusMessage: 'Method not allowed' })
  }

  try {
    const body = await readBody(event)
    const { id, IsAdmin, IsSuperAdmin } = body || {}

    if (!id && id !== 0) {
      throw createError({ statusCode: 400, statusMessage: '缺少用户ID' })
    }

    // 这里建议做服务端鉴权与角色校验（仅管理员/超级管理员可以操作，且非超级管理员不可设置他人为超级管理员）
    // 例如从 event.context.user 读取登录用户并检查权限（视你的鉴权实现而定）

    const db = getDb(event)
    const sql = `UPDATE users SET IsAdmin = ?, IsSuperAdmin = ? WHERE id = ?`
    const stmt = db.prepare(sql)
    await stmt.bind(IsAdmin ? 1 : 0, IsSuperAdmin ? 1 : 0, id).run()

    return { success: true }
  } catch (error) {
    console.error('updateUser error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})