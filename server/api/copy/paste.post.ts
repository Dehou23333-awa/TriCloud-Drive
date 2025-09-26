// server/api/copy/paste.post.ts
import { defineEventHandler, readBody } from 'h3'
import { getDb } from '~/server/utils/db-adapter'        // 若你的路径不同，请调整
import { requireAuth } from '~/server/utils/auth-middleware'

type RowFile = {
  id: number
  user_id: number
  folder_id: number | null
  filename: string
  file_key: string
  file_size: number
  file_url: string
  content_type: string | null
}

type RowFolder = {
  id: number
  user_id: number
  parent_id: number | null
  name: string
}

const isNil = (v: any) => v === null || v === undefined

function getInsertId(meta: any): number {
  return meta?.lastID ?? meta?.insertId ?? meta?.last_row_id ?? meta?.inserted_id
}

function splitNameAndExt(filename: string) {
  const idx = filename.lastIndexOf('.')
  if (idx > 0 && idx < filename.length - 1) {
    return { base: filename.slice(0, idx), ext: filename.slice(idx) }
  }
  return { base: filename, ext: '' }
}

function nextUniqueName(name: string, existing: Set<string>) {
  if (!existing.has(name)) return name
  // 针对文件/文件夹通用（文件请先拆分扩展名）
  // 规则：名称 / 名称 (2) / 名称 (3) ...
  const m = name.match(/^(.*)\s\((\d+)\)$/)
  let base = name
  let start = 2
  if (m) {
    base = m[1].trim()
    start = parseInt(m[2] || '1', 10) + 1
  }
  let n = start
  let candidate = `${base} (${n})`
  while (existing.has(candidate)) {
    n++
    candidate = `${base} (${n})`
  }
  return candidate
}

function nextUniqueFileName(filename: string, existing: Set<string>) {
  if (!existing.has(filename)) return filename
  const { base, ext } = splitNameAndExt(filename)
  // 已包含 (n) 的也能继续叠加
  const m = base.match(/^(.*)\s\((\d+)\)$/)
  let b = base
  let start = 2
  if (m) {
    b = m[1].trim()
    start = parseInt(m[2] || '1', 10) + 1
  }
  let n = start
  let candidate = `${b} (${n})${ext}`
  while (existing.has(candidate)) {
    n++
    candidate = `${b} (${n})${ext}`
  }
  return candidate
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const userId = user.userId as number

  const body = await readBody<{
    targetFolderId: number | null
    folderIds?: number[]
    fileIds?: number[]
  }>(event)

  const targetFolderId = isNil(body.targetFolderId) ? null : Number(body.targetFolderId)
  const folderIds = Array.from(new Set((body.folderIds || []).map(Number))).filter((x) => Number.isInteger(x))
  const fileIds = Array.from(new Set((body.fileIds || []).map(Number))).filter((x) => Number.isInteger(x))

  const db: any = getDb(event)

  // 校验 targetFolderId 归属
  if (targetFolderId !== null) {
    const targetRow = await db.prepare(
      'SELECT id FROM folders WHERE id = ? AND user_id = ?'
    ).bind(targetFolderId, userId).first()
    if (!targetRow) {
      return { success: false, message: '目标文件夹不存在或无权限' }
    }
  }

  // 读取源文件夹/文件，确认归属
  async function fetchFoldersByIds(ids: number[]): Promise<RowFolder[]> {
    if (!ids.length) return []
    const placeholders = ids.map(() => '?').join(',')
    const { results } = await db.prepare(
      `SELECT id, user_id, parent_id, name FROM folders WHERE user_id = ? AND id IN (${placeholders})`
    ).bind(userId, ...ids).all()
    return results || []
  }

  async function fetchFilesByIds(ids: number[]): Promise<RowFile[]> {
    if (!ids.length) return []
    const placeholders = ids.map(() => '?').join(',')
    const { results } = await db.prepare(
      `SELECT id, user_id, folder_id, filename, file_key, file_size, file_url, content_type
       FROM files WHERE user_id = ? AND id IN (${placeholders})`
    ).bind(userId, ...ids).all()
    return results || []
  }

  // 读取某父级下现有“文件夹名”和“文件名”，用于冲突检测
  async function loadExistingNameSets(parentId: number | null) {
    const foldersSql = parentId === null
      ? 'SELECT name FROM folders WHERE user_id = ? AND parent_id IS NULL'
      : 'SELECT name FROM folders WHERE user_id = ? AND parent_id = ?'
    const filesSql = parentId === null
      ? 'SELECT filename FROM files WHERE user_id = ? AND folder_id IS NULL'
      : 'SELECT filename FROM files WHERE user_id = ? AND folder_id = ?'

    const folderArgs = parentId === null ? [userId] : [userId, parentId]
    const fileArgs = parentId === null ? [userId] : [userId, parentId]

    const [f1, f2] = await Promise.all([
      db.prepare(foldersSql).bind(...folderArgs).all(),
      db.prepare(filesSql).bind(...fileArgs).all()
    ])

    const folderSet = new Set<string>((f1?.results || []).map((r: any) => r.name))
    const fileSet = new Set<string>((f2?.results || []).map((r: any) => r.filename))
    return { folderSet, fileSet }
  }

  // 复制：队列式复制整个子树
  async function copyFolderTree(root: RowFolder, dstParentId: number | null, nameSetsCache: {
    folderNames: Map<number | null, Set<string>>,
    fileNames: Map<number | null, Set<string>>
  }) {
    // 目标父级现有的“文件夹名集合”
    let targetFolderSet = nameSetsCache.folderNames.get(dstParentId)
    if (!targetFolderSet) {
      const { folderSet, fileSet } = await loadExistingNameSets(dstParentId)
      nameSetsCache.folderNames.set(dstParentId, folderSet)
      nameSetsCache.fileNames.set(dstParentId, fileSet)
      targetFolderSet = folderSet
    }

    // 为根复制一个新的文件夹名
    let newRootName = root.name
    if (targetFolderSet.has(newRootName)) {
      newRootName = nextUniqueName(newRootName, targetFolderSet)
    }

    // 插入根副本
    const insRoot = await db.prepare(
      'INSERT INTO folders (user_id, parent_id, name) VALUES (?, ?, ?)'
    ).bind(userId, dstParentId, newRootName).run()
    const newRootId = getInsertId(insRoot.meta)
    targetFolderSet.add(newRootName)

    // 为新根准备文件名集合（空的即可，因为新建后尚无文件）
    nameSetsCache.folderNames.set(newRootId, new Set<string>())
    nameSetsCache.fileNames.set(newRootId, new Set<string>())

    // 队列：待处理的源-目的文件夹对
    const queue: Array<{ srcId: number, dstId: number }> = [{ srcId: root.id, dstId: newRootId }]
    let filesCopied = 0
    let foldersCopied = 1 // 已复制了根
    let bytesCopied = 0n

    while (queue.length) {
      const { srcId, dstId } = queue.shift()!

      // 复制当前 srcId 下的文件到 dstId
      const { results: srcFiles } = await db.prepare(
        'SELECT id, user_id, folder_id, filename, file_key, file_size, file_url, content_type FROM files WHERE user_id = ? AND folder_id = ?'
      ).bind(userId, srcId).all()

      let dstFileNameSet = nameSetsCache.fileNames.get(dstId)
      if (!dstFileNameSet) {
        const { fileSet } = await loadExistingNameSets(dstId)
        dstFileNameSet = fileSet
        nameSetsCache.fileNames.set(dstId, dstFileNameSet)
      }

      for (const f of (srcFiles || [])) {
        const orig = f as RowFile
        const uniqueName = nextUniqueFileName(orig.filename, dstFileNameSet!)
        await db.prepare(
          'INSERT INTO files (user_id, folder_id, filename, file_key, file_size, file_url, content_type) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(userId, dstId, uniqueName, orig.file_key, orig.file_size, orig.file_url, orig.content_type).run()
        dstFileNameSet!.add(uniqueName)
        filesCopied++
        bytesCopied += BigInt(orig.file_size || 0)
      }

      // 查找子文件夹
      const { results: children } = await db.prepare(
        'SELECT id, user_id, parent_id, name FROM folders WHERE user_id = ? AND parent_id = ?'
      ).bind(userId, srcId).all()

      // 准备此 dstId 下的文件夹名集合
      let dstFolderNameSet = nameSetsCache.folderNames.get(dstId)
      if (!dstFolderNameSet) {
        const { folderSet } = await loadExistingNameSets(dstId)
        dstFolderNameSet = folderSet
        nameSetsCache.folderNames.set(dstId, dstFolderNameSet)
      }

      for (const c of (children || [])) {
        const child = c as RowFolder
        let newName = child.name
        if (dstFolderNameSet!.has(newName)) {
          newName = nextUniqueName(newName, dstFolderNameSet!)
        }
        const ins = await db.prepare(
          'INSERT INTO folders (user_id, parent_id, name) VALUES (?, ?, ?)'
        ).bind(userId, dstId, newName).run()
        const newChildId = getInsertId(ins.meta)
        dstFolderNameSet!.add(newName)
        // 初始化新子文件夹下的集合
        nameSetsCache.folderNames.set(newChildId, new Set<string>())
        nameSetsCache.fileNames.set(newChildId, new Set<string>())

        foldersCopied++
        queue.push({ srcId: child.id, dstId: newChildId })
      }
    }

    return { filesCopied, foldersCopied, bytesCopied }
  }

  // 开始事务
  await db.prepare('BEGIN').bind().run()
  try {
    // 为目标父级预读一次名字集合（避免重复查询）
    const nameSetsCache = {
      folderNames: new Map<number | null, Set<string>>(),
      fileNames: new Map<number | null, Set<string>>()
    }
    const firstSets = await loadExistingNameSets(targetFolderId)
    nameSetsCache.folderNames.set(targetFolderId, firstSets.folderSet)
    nameSetsCache.fileNames.set(targetFolderId, firstSets.fileSet)

    let totalFiles = 0
    let totalFolders = 0
    let totalBytes = 0n

    // 复制顶层选择的文件夹（自动避免重名）
    if (folderIds.length) {
      const srcFolders = await fetchFoldersByIds(folderIds)
      if (srcFolders.length !== folderIds.length) {
        throw new Error('部分文件夹不存在或无权限')
      }
      for (const root of srcFolders) {
        const res = await copyFolderTree(root, targetFolderId, nameSetsCache)
        totalFiles += res.filesCopied
        totalFolders += res.foldersCopied
        totalBytes += res.bytesCopied
      }
    }

    // 复制顶层选择的文件到目标父级
    if (fileIds.length) {
      const srcFiles = await fetchFilesByIds(fileIds)
      if (srcFiles.length !== fileIds.length) {
        throw new Error('部分文件不存在或无权限')
      }
      let dstFileNameSet = nameSetsCache.fileNames.get(targetFolderId)!
      for (const f of srcFiles) {
        const uniq = nextUniqueFileName(f.filename, dstFileNameSet)
        await db.prepare(
          'INSERT INTO files (user_id, folder_id, filename, file_key, file_size, file_url, content_type) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(userId, targetFolderId, uniq, f.file_key, f.file_size, f.file_url, f.content_type).run()
        dstFileNameSet.add(uniq)
        totalFiles++
        totalBytes += BigInt(f.file_size || 0)
      }
    }

    // usedStorage 叠加本次复制产生的总字节数
    if (totalBytes > 0n) {
      // SQLite/MySQL 都支持直接数值相加
      await db.prepare(
        'UPDATE users SET usedStorage = usedStorage + ? WHERE id = ?'
      ).bind(Number(totalBytes), userId).run()
    }

    await db.prepare('COMMIT').bind().run()
    return {
      success: true,
      affected: { folders: totalFolders, files: totalFiles, bytes: Number(totalBytes) }
    }
  } catch (err: any) {
    await db.prepare('ROLLBACK').bind().run()
    return { success: false, message: err?.message || '复制失败' }
  }
})