import { defineEventHandler, readBody } from 'h3'
import { getMeAndTarget } from '~/server/utils/auth-middleware'
import { getDb } from '~/server/utils/db-adapter'

function placeholders(n: number) {
  return Array(n).fill('?').join(',')
}
function uniqPositiveInts(arr: any[]): number[] {
  return [...new Set(
    (Array.isArray(arr) ? arr : [])
      .map(Number)
      .filter(n => Number.isInteger(n) && n > 0)
  )]
}
function hasDuplicates(list: string[]) {
  return new Set(list).size !== list.length
}

export default defineEventHandler(async (event) => {
  //const user = await requireAuth(event)
  const { targetUserId } = await getMeAndTarget(event)
  const userId = Number( targetUserId )
  const db = getDb(event)

  const body = await readBody<{
    targetFolderId: number | null
    folderIds?: number[]
    fileIds?: number[]
    overwrite?: boolean | null
    skipIfExist?: boolean | null
  }>(event)

  if (body.overwrite && body.skipIfExist) throw createError({ statusCode: 400, message: '不能既覆盖又跳过'})

  const targetFolderId = (body?.targetFolderId ?? null) as number | null
  const folderIds = uniqPositiveInts(body?.folderIds || [])
  const fileIds = uniqPositiveInts(body?.fileIds || [])

  if (!folderIds.length && !fileIds.length) {
    return { success: true, moved: { folders: 0, files: 0 }, message: '无移动项' }
  }

  // 校验目标文件夹
  if (targetFolderId !== null) {
    const target = await db
      .prepare('SELECT id FROM folders WHERE user_id = ? AND id = ?')
      .bind(userId, targetFolderId)
      .first()
    if (!target) {
      return { success: false, message: '目标文件夹不存在或无权限' }
    }
  }

  // 拉取待移动文件夹/文件
  const movedFolders = folderIds.length
    ? (await db
        .prepare(`SELECT id, name, parent_id FROM folders WHERE user_id = ? AND id IN (${placeholders(folderIds.length)})`)
        .bind(userId, ...folderIds)
        .all()).results as any[]
    : []

  if (movedFolders.length !== folderIds.length) {
    return { success: false, message: '部分文件夹不存在或无权限' }
  }

  const movedFiles = fileIds.length
    ? (await db
        .prepare(`SELECT id, filename, folder_id FROM files WHERE user_id = ? AND id IN (${placeholders(fileIds.length)})`)
        .bind(userId, ...fileIds)
        .all()).results as any[]
    : []

  if (movedFiles.length !== fileIds.length) {
    return { success: false, message: '部分文件不存在或无权限' }
  }

  // 防止把文件夹移动到其自身或其子孙中
  const getParentId = async (fid: number): Promise<number | null> => {
    const row: any = await db
      .prepare('SELECT parent_id FROM folders WHERE user_id = ? AND id = ?')
      .bind(userId, fid)
      .first()
    return row?.parent_id ?? null
  }
  const isTargetInsideFolder = async (folderId: number, targetId: number): Promise<boolean> => {
    let cur: number | null = targetId
    const visited = new Set<number>()
    for (let i = 0; i < 10000 && cur != null; i++) {
      if (visited.has(cur)) break
      if (cur === folderId) return true
      visited.add(cur)
      cur = await getParentId(cur)
    }
    return false
  }

  if (targetFolderId !== null) {
    for (const f of movedFolders) {
      if (f.id === targetFolderId) {
        return { success: false, message: `不能将文件夹 "${f.name}" 移动到其自身` }
      }
      const cyclic = await isTargetInsideFolder(f.id, targetFolderId)
      if (cyclic) {
        return { success: false, message: `不能将文件夹 "${f.name}" 移动到其子孙文件夹中` }
      }
    }
  }
/*
  for (var folderId of folderIds)
  {
    const rows: any = await db
      .prepare(`
        WITH RECURSIVE cte(id) AS (
          SELECT id FROM folders WHERE id = ? AND user_id = ?
          UNION ALL
          SELECT f.id FROM folders f
          JOIN cte ON f.parent_id = cte.id
          WHERE f.user_id = ?
        )
        SELECT id FROM cte
      `)
      .bind(Number(folderId), userId, userId)
      .all()

    const ids: number[] = (rows?.results || []).map((r: any) => Number(r.id)).filter((x: any) => Number.isInteger(x))
    if (ids.length === 0) {
      // 理论上不会发生：至少包含自身
      return { success: true, message: '无需删除' }
    }
  }*/

  // 重名冲突校验
  // 1) 同批次内重复名（文件夹）
  const movedFolderNames = movedFolders.map(f => String(f.name))
  if (hasDuplicates(movedFolderNames)) {
    return { success: false, message: '移动的文件夹中存在同名项目，无法移动（同一层级下不允许重名）' }
  }
  // 2) 同批次内重复名（文件）
  const movedFileNames = movedFiles.map(f => String(f.filename))
  if (hasDuplicates(movedFileNames)) {
    return { success: false, message: '移动的文件中存在同名项目，无法移动（同一文件夹下不允许重名）' }
  }

  // 3) 与目标文件夹现有项冲突（排除那些已经在目标里、ID 本身属于移动集合的）
  // 文件夹名冲突
  if (movedFolderNames.length) {
    const existingFolderNameRows = await db
      .prepare(
        `SELECT name FROM folders
         WHERE user_id = ?
           AND COALESCE(parent_id, -1) = COALESCE(?, -1)
           ${folderIds.length ? `AND id NOT IN (${placeholders(folderIds.length)})` : ''}
           AND name IN (${placeholders(movedFolderNames.length)})`
      )
      .bind(userId, targetFolderId, ...(folderIds.length ? folderIds : []), ...movedFolderNames)
      .all()
    const existingNames = new Set((existingFolderNameRows.results as any[]).map(r => r.name))
    if (existingNames.size) {
      return { success: false, message: `目标文件夹中已存在同名文件夹：${[...existingNames].join(', ')}` }
    }
  }

  // 文件名冲突
  if (movedFileNames.length) {
    const existingFileNameRows = await db
      .prepare(
        `SELECT filename FROM files
         WHERE user_id = ?
           AND COALESCE(folder_id, -1) = COALESCE(?, -1)
           ${fileIds.length ? `AND id NOT IN (${placeholders(fileIds.length)})` : ''}
           AND filename IN (${placeholders(movedFileNames.length)})`
      )
      .bind(userId, targetFolderId, ...(fileIds.length ? fileIds : []), ...movedFileNames)
      .all()
    const existingNames = new Set((existingFileNameRows.results as any[]).map(r => r.filename))
    if (existingNames.size) {
      return { success: false, message: `目标文件夹中已存在同名文件：${[...existingNames].join(', ')}` }
    }
  }

  // 执行移动（先文件后文件夹，避免触发潜在的级联问题）
  // 说明：适配器在 MySQL 下未提供连接级事务，这里通过“先校验后更新”的方式尽量避免部分成功。
  let movedFileCount = 0
  let movedFolderCount = 0

  try {
    if (fileIds.length) {
      const res: any = await db
        .prepare(`UPDATE files SET folder_id = ? WHERE user_id = ? AND id IN (${placeholders(fileIds.length)})`)
        .bind(targetFolderId, userId, ...fileIds)
        .run()
      movedFileCount = (res?.meta?.changes ?? res?.meta?.affectedRows ?? 0)
    }

    if (folderIds.length) {
      const res: any = await db
        .prepare(`UPDATE folders SET parent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id IN (${placeholders(folderIds.length)})`)
        .bind(targetFolderId, userId, ...folderIds)
        .run()
      movedFolderCount = (res?.meta?.changes ?? res?.meta?.affectedRows ?? 0)
    }

    return {
      success: true,
      moved: { folders: movedFolderCount, files: movedFileCount }
    }
  } catch (err: any) {
    // 可能因唯一索引冲突或其他原因失败
    return { success: false, message: err?.message || '移动失败，请稍后重试' }
  }
})