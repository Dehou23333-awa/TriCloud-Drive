import { requireAuth } from '~/server/utils/auth-middleware'
import { getDb } from '~/server/utils/db-adapter'
import { getQuery } from 'h3'

export default defineEventHandler(async (event) => {
  try {
    // 认证
    const user = await requireAuth(event)

    // 数据库连接
    const db = getDb(event)
    if (!db) {
      throw createError({ statusCode: 500, statusMessage: '数据库连接失败' })
    }

    // 解析 folderId（root/0/空 => 根层）
    const { folderId: rawFolderId } = getQuery(event) as { folderId?: string }
    let folderId: number | null = null

    if (rawFolderId && rawFolderId !== 'root' && rawFolderId !== '0') {
      const parsed = Number(rawFolderId)
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw createError({ statusCode: 400, statusMessage: '非法的 folderId' })
      }
      folderId = parsed

      // 校验当前目录是否属于用户
      const check = await db
        .prepare('SELECT 1 FROM folders WHERE id = ? AND user_id = ?')
        .bind(folderId, user.userId)
        .all()
      if (!check.results || check.results.length === 0) {
        throw createError({ statusCode: 404, statusMessage: '文件夹不存在或无权限' })
      }
    }

    // 查询子文件夹
    const foldersRes = folderId === null
      ? await db
          .prepare(`
            SELECT id, name, parent_id AS parentId, created_at AS createdAt
            FROM folders
            WHERE user_id = ? AND parent_id IS NULL
            ORDER BY name COLLATE NOCASE ASC
          `)
          .bind(user.userId)
          .all()
      : await db
          .prepare(`
            SELECT id, name, parent_id AS parentId, created_at AS createdAt
            FROM folders
            WHERE user_id = ? AND parent_id = ?
            ORDER BY name COLLATE NOCASE ASC
          `)
          .bind(user.userId, folderId)
          .all()

    // 查询当前目录内的文件
    const filesRes = folderId === null
      ? await db
          .prepare(`
            SELECT
              id, filename, folder_id AS folderId,
              file_key AS fileKey, file_size AS fileSize,
              file_url AS fileUrl, content_type AS contentType,
              created_at AS createdAt
            FROM files
            WHERE user_id = ? AND folder_id IS NULL
            ORDER BY created_at DESC
          `)
          .bind(user.userId)
          .all()
      : await db
          .prepare(`
            SELECT
              id, filename, folder_id AS folderId,
              file_key AS fileKey, file_size AS fileSize,
              file_url AS fileUrl, content_type AS contentType,
              created_at AS createdAt
            FROM files
            WHERE user_id = ? AND folder_id = ?
            ORDER BY created_at DESC
          `)
          .bind(user.userId, folderId)
          .all()

    return {
      success: true,
      currentFolderId: folderId,          // null 表示根层
      folders: foldersRes.results || [],  // 当前目录下的子文件夹
      files: filesRes.results || []       // 当前目录下的文件
    }
  } catch (error: any) {
    console.error('Get items error:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, statusMessage: '获取列表失败' })
  }
})