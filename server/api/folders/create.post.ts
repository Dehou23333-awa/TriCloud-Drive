// server/api/folders/create.post.ts
import { getMeAndTarget } from '~/server/utils/auth-middleware'
import { getDb } from '~/server/utils/db-adapter'

export default defineEventHandler(async (event) => {
  function normalizeFolderId(input: any): number | null {
    if (input === undefined || input === null || input === '' || input === 'root' || input === '0' || input === 0) {
      return null
    }
    const n = Number(input)
    if (!Number.isInteger(n) || n < 1) {
      throw createError({ statusCode: 400, statusMessage: '非法的 parentId' })
    }
    return n
  }

  try {
    //const user = await requireAuth(event)
    const { targetUserId } = await getMeAndTarget(event)
    const userId = Number(targetUserId)
    const db = getDb(event)
    if (!db) throw createError({ statusCode: 500, statusMessage: '数据库连接失败' })

    const body = await readBody(event)
    const nameRaw = String(body?.name || '').trim()
    const parentId = normalizeFolderId(body?.parentId)

    if (!nameRaw) {
      throw createError({ statusCode: 400, statusMessage: '文件夹名称不能为空' })
    }
    if (nameRaw.length > 255) {
      throw createError({ statusCode: 400, statusMessage: '文件夹名称过长（最多255字符）' })
    }

    // 校验父级归属
    if (parentId !== null) {
      const p = await db
        .prepare('SELECT 1 FROM folders WHERE id = ? AND user_id = ?')
        .bind(parentId, userId)
        .first()
      if (!p) throw createError({ statusCode: 404, statusMessage: '父级文件夹不存在或无权限' })
    }

    // 防重（同一父级下不允许重名）
    const exists = parentId === null
      ? await db.prepare('SELECT 1 FROM folders WHERE user_id = ? AND parent_id IS NULL AND name = ?')
          .bind(userId, nameRaw).first()
      : await db.prepare('SELECT 1 FROM folders WHERE user_id = ? AND parent_id = ? AND name = ?')
          .bind(userId, parentId, nameRaw).first()

    if (exists) {
      throw createError({ statusCode: 409, statusMessage: '已存在同名文件夹' })
    }

    // 插入
    const ins: any = await db
      .prepare('INSERT INTO folders (user_id, parent_id, name) VALUES (?, ?, ?)')
      .bind(userId, parentId, nameRaw)
      .run()

    // 获取新ID（兼容 sqlite/MySQL/D1）
    const newId = ins?.meta?.lastID ?? ins?.meta?.insertId ?? ins?.meta?.last_row_id
    let folder: any
    if (newId) {
      folder = await db
        .prepare('SELECT id, name, parent_id AS parentId, created_at AS createdAt FROM folders WHERE id = ? AND user_id = ?')
        .bind(newId, userId)
        .first()
    } else {
      // 兜底查询（以防不同驱动 meta 差异）
      folder = await db
        .prepare(`
          SELECT id, name, parent_id AS parentId, created_at AS createdAt
          FROM folders
          WHERE user_id = ? AND name = ? AND ${parentId === null ? 'parent_id IS NULL' : 'parent_id = ?'}
          ORDER BY id DESC
          LIMIT 1
        `)
        .bind(...([userId, nameRaw] as any[]).concat(parentId === null ? [] : [parentId]))
        .first()
    }

    return { success: true, folder }
  } catch (error: any) {
    console.error('Create folder error:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, statusMessage: '创建文件夹失败' })
  }
})