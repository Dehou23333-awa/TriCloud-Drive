// server/api/folders/manifest.get.ts
import { getMeAndTarget } from '~/server/utils/auth-middleware'
import { getDb } from '~/server/utils/db-adapter'

export default defineEventHandler(async (event) => {
  const { targetUserId } = await getMeAndTarget(event)
  const userId = Number(targetUserId)
  const q = getQuery(event)
  const folderId = Number(q.folderId)

  if (!Number.isFinite(folderId)) {
    throw createError({ statusCode: 400, statusMessage: 'folderId 无效' })
  }

  const db = getDb(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: '数据库连接失败' })
  }

  // 校验文件夹归属
  const folder = await db
    .prepare('SELECT id, name FROM folders WHERE id = ? AND user_id = ?')
    .bind(folderId, userId)
    .first()

  if (!folder) {
    throw createError({ statusCode: 404, statusMessage: '文件夹不存在或无权访问' })
  }

  // 递归收集文件（带相对路径 relDir）
  const listRes = await db
    .prepare(`
      WITH RECURSIVE tree(id, name, parent_id, rel_dir) AS (
        SELECT id, name, parent_id, '' AS rel_dir
        FROM folders
        WHERE id = ? AND user_id = ?
        UNION ALL
        SELECT f.id, f.name, f.parent_id,
          CASE
            WHEN tree.rel_dir = '' THEN f.name
            ELSE tree.rel_dir || '/' || f.name
          END AS rel_dir
        FROM folders f
        JOIN tree ON f.parent_id = tree.id
        WHERE f.user_id = ?
      )
      SELECT fl.id       AS id,
             fl.filename AS filename,
             fl.file_key AS fileKey,
             fl.file_size AS fileSize,
             tree.rel_dir AS relDir
      FROM files fl
      JOIN tree ON fl.folder_id = tree.id
      WHERE fl.user_id = ?
      ORDER BY relDir, filename
    `)
    .bind(folderId, userId, userId, userId)
    .all()

  const files = (listRes as any)?.results ?? (listRes as any) ?? []
  const totalBytes = files.reduce((s: number, f: any) => s + Number(f.fileSize || 0), 0)

  // 预检（不预占）：检查总大小是否会超出下载额度
  const quotaRow = await db
    .prepare('SELECT COALESCE(usedDownload, 0) AS usedDownload, COALESCE(maxDownload, 0) AS maxDownload FROM users WHERE id = ?')
    .bind(userId)
    .first()

  const used = Number(quotaRow?.usedDownload ?? 0)
  const max = Number(quotaRow?.maxDownload ?? 0)
  const unlimited = max <= 0
  const remaining = unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, max - used)
  const allowed = unlimited || used + totalBytes <= max
  const exceedBytes = allowed ? 0 : Math.max(0, used + totalBytes - max)

  return {
    success: true,
    folder: { id: folder.id, name: folder.name },
    files, // [{ id, filename, fileKey, fileSize, relDir }]
    totals: {
      count: files.length,
      bytes: totalBytes
    },
    // 新增：仅用于提示的总量预检，不进行额度预占
    precheck: {
      allowed,                 // true=总量不超；false=总量会超
      unlimited,               // true=不限流
      requiredBytes: totalBytes,
      remainingBytes: unlimited ? -1 : remaining,
      exceedBytes,             // 将超出的字节数
      usedDownload: used,
      maxDownload: max
    }
  }
})