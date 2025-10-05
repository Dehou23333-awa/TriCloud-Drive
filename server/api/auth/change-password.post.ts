// server/api/auth/change-password.post.ts
import { readBody, createError } from 'h3'
import { getDb } from '~/server/utils/db-adapter' // 按你的文件实际路径调整
import { requireAuth } from '~/server/utils/auth-middleware'
import { validatePassword, verifyPassword, hashPassword } from '~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event, { withUser: true } )
  
  const body = await readBody(event)
  const currentPassword = String(body?.currentPassword || '')
  const newPassword = String(body?.newPassword || '')

  if (!validatePassword(newPassword)) {
    throw createError({
      statusCode: 400,
      statusMessage: '密码至少8位，且包含字母和数字'
    })
  }
  
  const db = getDb(event)
  if (!db) {
    throw createError({
      statusCode: 500,
      statusMessage: '数据库连接失败'
    })
  }
  
  // 读取用户
  const row: any = await db
    .prepare('SELECT id, password_hash FROM users WHERE id = ?')
    .bind(user.userId)
    .first()

  if (!row?.id) {
    throw createError({ statusCode: 404, statusMessage: '用户不存在' })
  }

  // 权限验证（后端也要校验，避免仅靠前端隐藏）
  const canChange = user.canChangePassword
  if (!canChange) {
    throw createError({ statusCode: 403, statusMessage: '无权限修改密码' })
  }
  const isValidPassword = await verifyPassword(currentPassword, user.password_hash || '')
  if (!isValidPassword) {
    throw createError({
      statusCode: 400,
      statusMessage: '当前密码不正确'
    })
  }

  // 更新新密码
  const passwordHash = await hashPassword(newPassword)

  await db
    .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(passwordHash, row.id)
    .run()
  deleteCookie(event, 'auth-token')

  return { success: true }
})