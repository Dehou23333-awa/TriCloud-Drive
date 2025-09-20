// server/folders/ensure-paths.post.ts
import { requireAuth } from '~/server/utils/auth-middleware'
import { getDb } from '~/server/utils/db-adapter'

export default defineEventHandler(async (event) => {
  function normalizeFolderId(input: any): number | null {
    if (input === undefined || input === null || input === '' || input === 'root' || input === '0' || input === 0) return null
    const n = Number(input)
    if (!Number.isInteger(n) || n < 1) throw createError({ statusCode: 400, statusMessage: '非法的 parentId' })
    return n
  }
  function normalizePath(p: string): string {
    return String(p || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '')
  }
  function validateSegment(seg: string) {
    const name = seg.trim()
    if (!name) throw createError({ statusCode: 400, statusMessage: '目录名不能为空' })
    if (name.length > 255) throw createError({ statusCode: 400, statusMessage: `目录名过长：${name}` })
    if (name === '.' || name === '..') throw createError({ statusCode: 400, statusMessage: `非法目录名：${name}` })
    return name
  }

  try {
    const user = await requireAuth(event)
    const db = getDb(event)
    if (!db) throw createError({ statusCode: 500, statusMessage: '数据库连接失败' })

    const body = await readBody(event)
    const parentId = normalizeFolderId(body?.parentId)
    let paths: string[] = Array.isArray(body?.paths) ? body.paths : []
    if (!paths.length) return { success: true, map: {} }

    if (parentId !== null) {
      const p = await db.prepare('SELECT 1 FROM folders WHERE id = ? AND user_id = ?').bind(parentId, user.userId).first()
      if (!p) throw createError({ statusCode: 404, statusMessage: '父级文件夹不存在或无权限' })
    }

    const uniq = Array.from(new Set(paths.map(normalizePath)))
    const result: Record<string, number> = {}

    await db.prepare('SAVEPOINT ensure_paths_tx').bind().run()
    try {
      for (const p of uniq) {
        if (!p) { if (parentId !== null) result[''] = parentId; continue }
        const segs = p.split('/').map(validateSegment)
        let currentParent: number | null = parentId

        for (const seg of segs) {
          let row: any
          if (currentParent === null) {
            row = await db.prepare('SELECT id FROM folders WHERE user_id = ? AND parent_id IS NULL AND name = ? LIMIT 1').bind(user.userId, seg).first()
          } else {
            row = await db.prepare('SELECT id FROM folders WHERE user_id = ? AND parent_id = ? AND name = ? LIMIT 1').bind(user.userId, currentParent, seg).first()
          }
          if (!row) {
            const ins: any = await db.prepare('INSERT INTO folders (user_id, parent_id, name) VALUES (?, ?, ?)').bind(user.userId, currentParent, seg).run()
            const newId = ins?.meta?.lastID ?? ins?.meta?.insertId ?? ins?.meta?.last_row_id
            if (newId) currentParent = Number(newId)
            else {
              const back: any = currentParent === null
                ? await db.prepare('SELECT id FROM folders WHERE user_id = ? AND parent_id IS NULL AND name = ? ORDER BY id DESC LIMIT 1').bind(user.userId, seg).first()
                : await db.prepare('SELECT id FROM folders WHERE user_id = ? AND parent_id = ? AND name = ? ORDER BY id DESC LIMIT 1').bind(user.userId, currentParent, seg).first()
              currentParent = Number(back?.id)
            }
          } else {
            currentParent = Number(row.id)
          }
        }
        result[p] = currentParent as number
      }
      await db.prepare('RELEASE ensure_paths_tx').bind().run()
    } catch (e) {
      try { await db.prepare('ROLLBACK TO ensure_paths_tx').bind().run(); await db.prepare('RELEASE ensure_paths_tx').bind().run() } catch {}
      throw e
    }

    return { success: true, map: result }
  } catch (error: any) {
    console.error('Ensure paths error:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, statusMessage: '确保目录失败' })
  }
})