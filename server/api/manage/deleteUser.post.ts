// server/api/manage/deleteUser.ts
import { defineEventHandler, readBody, createError, getMethod } from 'h3'
import { getDb } from '~/server/utils/db-adapter' // 如你的适配器不在该路径，请调整

function toBool(v: any) {
    return v === true || v === 1 || v === '1'
}

export default defineEventHandler(async (event) => {
    const authUser = await requireAuth(event)
    if (getMethod(event) !== 'POST') {
        throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' })
    }
    /*
      // 获取当前登录用户（依据你的鉴权中间件，可能是在 context.user 或 context.auth.user 等）
      const ctx: any = event.context as any
      const current =
        ctx.user ||
        ctx.auth?.user ||
        ctx.session?.user
    
      if (!current) {
        throw createError({ statusCode: 401, statusMessage: '未登录' })
      }
    
      const isAdmin = toBool(current.IsAdmin)
      const isSuperAdmin = toBool(current.IsSuperAdmin)
    
      if (!isAdmin && !isSuperAdmin) {
        throw createError({ statusCode: 403, statusMessage: '无权限' })
      }*/


    const body = await readBody<{ id: number | string }>(event)
    const userId = Number(body?.id)
    if (!Number.isInteger(userId) || userId <= 0) {
        throw createError({ statusCode: 400, statusMessage: '参数错误：id' })
    }
    /*
      if (userId === Number(current.id)) {
        throw createError({ statusCode: 400, statusMessage: '不允许删除自己' })
      }*/

    const db = getDb(event)
    
    const userService = new UserService(db)

    // 获取用户信息
    const user = await userService.getUserById(authUser.userId)
    if (!user) {
        throw createError({
            statusCode: 404,
            statusMessage: '用户不存在'
        })
    }

    // 查询目标用户
    const target = await db
        .prepare('SELECT id, email, username, IsAdmin, IsSuperAdmin FROM users WHERE id = ?')
        .bind(userId)
        .first()

    if (!target) {
        throw createError({ statusCode: 404, statusMessage: '用户不存在' })
    }

    const targetIsAdmin = toBool((target as any).IsAdmin)
    const targetIsSuperAdmin = toBool((target as any).IsSuperAdmin)

    // 权限规则：
    // - 超管可以删除任何用户，但不能删除系统最后一个超管
    // - 管理员只能删除普通用户（不能删管理员或超管）
    if (!user.IsSuperAdmin) {
        if (targetIsAdmin || targetIsSuperAdmin) {
            throw createError({ statusCode: 403, statusMessage: '普通管理员不能删除管理员或超级管理员' })
        }
    }

    // 若要删除的是超管，确保不是最后一个超管
    if (targetIsSuperAdmin) {
        const row = await db
            .prepare('SELECT COUNT(1) AS cnt FROM users WHERE IsSuperAdmin = 1')
            .first()
        const cnt = Number((row as any)?.cnt ?? 0)
        if (cnt <= 1) {
            throw createError({ statusCode: 400, statusMessage: '不能删除最后一个超级管理员' })
        }
    }

    // 确保开启外键约束（SQLite 本地），D1 不一定支持 PRAGMA，这里失败就忽略
    try {
        await db.prepare('PRAGMA foreign_keys = ON;').run()
    } catch (e) {
        // ignore
    }

    // 删除用户（files 表已设置 ON DELETE CASCADE）
    try {
        await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run()
    } catch (e: any) {
        throw createError({ statusCode: 500, statusMessage: e?.message || '删除失败' })
    }

    return { success: true }
})