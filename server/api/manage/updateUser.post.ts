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