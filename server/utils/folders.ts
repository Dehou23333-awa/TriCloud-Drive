// server/utils/folders.ts
import { createError } from 'h3'
import { Database } from '~/server/utils/db'
/*
type DBLike = {
  prepare: (sql: string) => {
    bind: (...args: any[]) => any
    first: <T = any>() => Promise<T | null>
    run: () => Promise<any>
  }
}
*/
export function normalizeFolderId(input: any): number | null {
  if (input === undefined || input === null || input === '' || input === 'root' || input === '0' || input === 0) {
    return null
  }
  const n = Number(input)
  if (!Number.isInteger(n) || n < 1) {
    throw createError({ statusCode: 400, statusMessage: '非法的 parentId' })
  }
  return n
}

export function normalizePath(p: string): string {
  return String(p || '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '')
}

function validateSegment(seg: string) {
  const name = seg.trim()
  if (!name) throw createError({ statusCode: 400, statusMessage: '目录名不能为空' })
  if (name.length > 255) throw createError({ statusCode: 400, statusMessage: `目录名过长：${name}` })
  if (name === '.' || name === '..') throw createError({ statusCode: 400, statusMessage: `非法目录名：${name}` })
  return name
}

function getLastInsertId(meta?: any): number | undefined {
  return meta?.lastID ?? meta?.insertId ?? meta?.last_row_id
}

async function assertParent(db: Database, userId: number, parentId: number | null) {
  if (parentId === null) return
  const p = await db.prepare('SELECT 1 FROM folders WHERE id = ? AND user_id = ?')
    .bind(parentId, userId)
    .first()
  if (!p) throw createError({ statusCode: 404, statusMessage: '父级文件夹不存在或无权限' })
}

/**
 * 创建单个文件夹（同一父级下不允许重名）
 * 保持与原 create.post.ts 相同的校验与返回
 */
export async function createFolder(
  db: Database,
  userId: number,
  params: { name?: any; parentId?: any }
) {
  const nameRaw = String(params?.name || '').trim()
  const parentId = normalizeFolderId(params?.parentId)

  if (!nameRaw) {
    throw createError({ statusCode: 400, statusMessage: '文件夹名称不能为空' })
  }
  if (nameRaw.length > 255) {
    throw createError({ statusCode: 400, statusMessage: '文件夹名称过长（最多255字符）' })
  }

  await assertParent(db, userId, parentId)

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

  const newId = getLastInsertId(ins?.meta)
  let folder: any
  if (newId) {
    folder = await db
      .prepare('SELECT id, name, parent_id AS parentId, created_at AS createdAt FROM folders WHERE id = ? AND user_id = ?')
      .bind(newId, userId)
      .first()
  } else {
    // 兜底查询（以防不同驱动 meta 差异）
    const whereParent = parentId === null ? 'parent_id IS NULL' : 'parent_id = ?'
    const stmt = db.prepare(`
      SELECT id, name, parent_id AS parentId, created_at AS createdAt
      FROM folders
      WHERE user_id = ? AND name = ? AND ${whereParent}
      ORDER BY id DESC
      LIMIT 1
    `)
    const args = parentId === null ? [userId, nameRaw] : [userId, nameRaw, parentId]
    folder = await stmt.bind(...args).first()
  }

  return folder
}

/**
 * 批量按相对路径确保目录存在，并返回路径到最终目录ID的映射
 * 与原 ensure-paths.post.ts 保持行为一致（包含 SAVEPOINT 事务）
 */
export async function ensurePaths(
  db: Database,
  userId: number,
  params: { parentId?: any; paths?: any }
): Promise<Record<string, number>> {
  const parentId = normalizeFolderId(params?.parentId)
  let paths: string[] = Array.isArray(params?.paths) ? params.paths : []

  if (!paths.length) return {}

  await assertParent(db, userId, parentId)

  const uniq = Array.from(new Set(paths.map(normalizePath)))
  const result: Record<string, number> = {}

  await db.prepare('SAVEPOINT ensure_paths_tx').bind().run()
  try {
    for (const p of uniq) {
      if (!p) {
        if (parentId !== null) result[''] = parentId
        continue
      }
      const segs = p.split('/').map(validateSegment)
      let currentParent: number | null = parentId

      for (const seg of segs) {
        let row: any
        if (currentParent === null) {
          row = await db
            .prepare('SELECT id FROM folders WHERE user_id = ? AND parent_id IS NULL AND name = ? LIMIT 1')
            .bind(userId, seg)
            .first()
        } else {
          row = await db
            .prepare('SELECT id FROM folders WHERE user_id = ? AND parent_id = ? AND name = ? LIMIT 1')
            .bind(userId, currentParent, seg)
            .first()
        }

        if (!row) {
          const ins: any = await db
            .prepare('INSERT INTO folders (user_id, parent_id, name) VALUES (?, ?, ?)')
            .bind(userId, currentParent, seg)
            .run()

          const newId = getLastInsertId(ins?.meta)
          if (newId) {
            currentParent = Number(newId)
          } else {
            // 兜底查询
            const back = currentParent === null
              ? await db
                  .prepare('SELECT id FROM folders WHERE user_id = ? AND parent_id IS NULL AND name = ? ORDER BY id DESC LIMIT 1')
                  .bind(userId, seg)
                  .first()
              : await db
                  .prepare('SELECT id FROM folders WHERE user_id = ? AND parent_id = ? AND name = ? ORDER BY id DESC LIMIT 1')
                  .bind(userId, currentParent, seg)
                  .first()
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
    try {
      await db.prepare('ROLLBACK TO ensure_paths_tx').bind().run()
      await db.prepare('RELEASE ensure_paths_tx').bind().run()
    } catch {}
    throw e
  }

  return result
}