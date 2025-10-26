import { defineEventHandler, readBody } from 'h3'
import COS from 'cos-nodejs-sdk-v5'
import { useRuntimeConfig } from '#imports'
import { getMeAndTarget } from '~/server/utils/auth-middleware'
import { getDb } from '~/server/utils/db-adapter'
import { ensurePaths } from '~/server/utils/folders'
import { resolveUniqueFilename, recalculateUsedStorage } from '~/server/utils/file'
import { skipAndOverwriteError } from '~/types/error'

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
function sanitizeForKey(name: string): string {
  return name.replace(/[\\?%*:|"<>]/g, '_').replace(/[\s]+/g, ' ')
}
function randomId(len = 10) {
  return Math.random().toString(36).slice(2, 2 + len)
}

export default defineEventHandler(async (event) => {
  const { targetUserId } = await getMeAndTarget(event)
  const userId = Number(targetUserId)
  const db: any = getDb(event)
  if (!db) return { success: false, message: '数据库连接失败' }

  const body = await readBody<{
    targetFolderId: number | null
    folderIds?: number[]
    fileIds?: number[]
    overwrite?: boolean | null
    skipIfExist?: boolean | null
  }>(event)

  if (body.overwrite && body.skipIfExist) throw skipAndOverwriteError

  const targetFolderId = (body?.targetFolderId ?? null) as number | null
  const folderIds = uniqPositiveInts(body?.folderIds || [])
  const fileIds = uniqPositiveInts(body?.fileIds || [])

  if (!folderIds.length && !fileIds.length) {
    return { success: true, copied: { folders: 0, files: 0 }, skipped: 0, failed: 0, message: '无复制项' }
  }

  // 读取目标文件夹（仅校验属于该用户）
  if (targetFolderId !== null) {
    const target = await db
      .prepare('SELECT id FROM folders WHERE user_id = ? AND id = ?')
      .bind(userId, targetFolderId)
      .first()
    if (!target) {
      return { success: false, message: '目标文件夹不存在或无权限' }
    }
  }

  // 拉取待复制的顶层文件夹列表
  const movedFolders = folderIds.length
    ? (await db
      .prepare(`SELECT id, name, parent_id FROM folders WHERE user_id = ? AND id IN (${placeholders(folderIds.length)})`)
      .bind(userId, ...folderIds)
      .all()).results as any[]
    : []
  if (movedFolders.length !== folderIds.length) {
    return { success: false, message: '部分文件夹不存在或无权限' }
  }

  // 拉取待复制的单个文件列表（包含复制所需字段）
  type SrcFile = {
    id: number
    filename: string
    folderId: number | null
    fileKey: string
    fileSize: number
    contentType: string | null
  }
  const movedFiles: SrcFile[] = fileIds.length
    ? ((await db
      .prepare(`SELECT id, filename, folder_id AS folderId, file_key AS fileKey, file_size AS fileSize, content_type AS contentType
                FROM files WHERE user_id = ? AND id IN (${placeholders(fileIds.length)})`)
      .bind(userId, ...fileIds)
      .all()).results as any[]).map(r => ({
        id: Number(r.id),
        filename: String(r.filename),
        folderId: r.folderId == null ? null : Number(r.folderId),
        fileKey: String(r.fileKey),
        fileSize: Number(r.fileSize),
        contentType: r.contentType ? String(r.contentType) : null
      }))
    : []
  if (movedFiles.length !== fileIds.length) {
    return { success: false, message: '部分文件不存在或无权限' }
  }

  // 准备：收集 folder 子树的所有子目录与文件，并生成相对路径
  const CHUNK = 500
  const pathsToEnsure = new Set<string>() // e.g. "A", "A/B"
  const relPathByFolderId = new Map<number, string>() // folderId -> "A/B"
  const filesFromFolders: SrcFile[] = []
  const filesFromFoldersSet = new Set<number>()

  // 工具：广度优先收集子树
  async function collectSubtree(rootId: number, rootName: string) {
    relPathByFolderId.set(rootId, rootName)
    pathsToEnsure.add(rootName)

    const subtree = new Set<number>([rootId])
    let frontier: number[] = [rootId]
    while (frontier.length > 0) {
      const ph = placeholders(frontier.length)
      const res = await db
        .prepare(`SELECT id, parent_id, name FROM folders WHERE user_id = ? AND parent_id IN (${ph})`)
        .bind(userId, ...frontier)
        .all()
      const rows = (res?.results || []) as any[]
      const next: number[] = []
      for (const r of rows) {
        const id = Number(r.id)
        if (!subtree.has(id)) {
          subtree.add(id)
          const parentPath = relPathByFolderId.get(Number(r.parent_id)) || ''
          const myPath = parentPath ? `${parentPath}/${String(r.name)}` : String(r.name)
          relPathByFolderId.set(id, myPath)
          pathsToEnsure.add(myPath)
          next.push(id)
        }
      }
      frontier = next
    }

    // 收集该子树中的所有文件（带 key/size/type）
    const ids = Array.from(subtree)
    for (let i = 0; i < ids.length; i += CHUNK) {
      const batch = ids.slice(i, i + CHUNK)
      const ph = placeholders(batch.length)
      const res = await db
        .prepare(`SELECT id, filename, folder_id AS folderId, file_key AS fileKey, file_size AS fileSize, content_type AS contentType
                  FROM files WHERE user_id = ? AND folder_id IN (${ph})`)
        .bind(userId, ...batch)
        .all()
      const list: SrcFile[] = (res?.results || []).map((r: any) => ({
        id: Number(r.id),
        filename: String(r.filename),
        folderId: r.folderId == null ? null : Number(r.folderId),
        fileKey: String(r.fileKey),
        fileSize: Number(r.fileSize),
        contentType: r.contentType ? String(r.contentType) : null
      }))
      for (const f of list) {
        filesFromFolders.push(f)
        filesFromFoldersSet.add(f.id)
      }
    }
  }

  for (const f of movedFolders) {
    await collectSubtree(Number(f.id), String(f.name))
  }

  // 在目标位置创建/复用需要的目录（含空目录）
  const destMap = await ensurePaths(db, userId, {
    parentId: targetFolderId,
    paths: Array.from(pathsToEnsure),
  })

  // 生成复制计划（来自文件夹子树 + 额外指定的单个文件）
  type DupInfo = { id: number, fileKey: string, fileSize: number }
  type PlanItem = {
    src: SrcFile
    destFolderId: number | null
    finalFilename: string
    overwriteExisting?: DupInfo
  }
  const plan: PlanItem[] = []

  // 子树的文件
  for (const f of filesFromFolders) {
    const rel = relPathByFolderId.get(f.folderId ?? -1) || ''
    const destFolderId = rel ? (destMap[rel] ?? null) : targetFolderId
    plan.push({
      src: f,
      destFolderId,
      finalFilename: f.filename
    })
  }
  // 额外选中的单个文件（排除已在子树内的）
  for (const f of movedFiles) {
    if (filesFromFoldersSet.has(Number(f.id))) continue
    plan.push({
      src: f,
      destFolderId: targetFolderId,
      finalFilename: f.filename
    })
  }

  // 查重复工具
  async function findDup(destFolderId: number | null, filename: string): Promise<DupInfo | null> {
    const sql = destFolderId === null
      ? `SELECT id, file_key AS fileKey, file_size AS fileSize FROM files WHERE user_id = ? AND folder_id IS NULL AND filename = ? LIMIT 1`
      : `SELECT id, file_key AS fileKey, file_size AS fileSize FROM files WHERE user_id = ? AND folder_id = ? AND filename = ? LIMIT 1`
    const args = destFolderId === null ? [userId, filename] : [userId, destFolderId, filename]
    const row = await db.prepare(sql).bind(...args).first()
    if (!row) return null
    return { id: Number(row.id), fileKey: String(row.fileKey), fileSize: Number(row.fileSize) }
  }

  // 冲突处理：skip/overwrite/rename（并顺便计算净新增空间）
  const toCopy: PlanItem[] = []
  let bytesToCopy = 0
  let bytesToFreeByOverwrite = 0

  for (const item of plan) {
    const { src, destFolderId } = item

    // 若目标与源是同一 folder 且同名，按“复制”语义不允许覆盖源：优先改名
    const dup = await findDup(destFolderId, item.finalFilename)

    if (dup) {
      if (body?.skipIfExist) {
        // 跳过
        continue
      } else if (body?.overwrite) {
        // 先计划复制（成功后删除旧记录与对象）
        toCopy.push({ ...item, overwriteExisting: dup })
        bytesToCopy += src.fileSize
        bytesToFreeByOverwrite += dup.fileSize
      } else {
        // 默认：改名
        const { name: unique } = await resolveUniqueFilename(db, userId, destFolderId, item.finalFilename)
        toCopy.push({ ...item, finalFilename: unique })
        bytesToCopy += src.fileSize
      }
    } else {
      // 无冲突
      toCopy.push(item)
      bytesToCopy += src.fileSize
    }
  }

  // 原子预占空间（净新增：复制总和 - 覆盖释放）
  const reserveBytes = Math.max(0, bytesToCopy - bytesToFreeByOverwrite)
  if (reserveBytes > 0) {
    const res = await db
      .prepare('UPDATE users SET usedStorage = usedStorage + ? WHERE id = ? AND usedStorage + ? <= maxStorage')
      .bind(reserveBytes, userId, reserveBytes)
      .run()
    const changed = Number(res?.meta?.changes || res?.meta?.rows_affected || 0)
    if (!changed) {
      return { success: false, message: '存储空间不足，无法完成复制' }
    }
  }

  // COS 客户端
  const config = useRuntimeConfig()
  const cos = new COS({
    SecretId: config.tencentSecretId,
    SecretKey: config.tencentSecretKey,
    // 可选：启用加速域名等参数
  })
  const Bucket = config.cosBucket
  const Region = config.cosRegion
  const MAX_CONCURRENCY = config.maxConcurrency

  function cosCopyObject(srcKey: string, destKey: string): Promise<any> {
    const CopySource = `${Bucket}.cos.${Region}.myqcloud.com/${encodeURIComponent(srcKey)}`
    return new Promise((resolve, reject) => {
      cos.sliceCopyFile(
        { Bucket, Region, Key: destKey, CopySource },
        (err, data) => (err ? reject(err) : resolve(data))
      )
    })
  }
  function cosDeleteObject(key: string): Promise<void> {
    return new Promise((resolve) => {
      cos.deleteObject({ Bucket, Region, Key: key }, () => resolve())
    })
  }
  function buildCosKey(userId: number, filename: string) {
    const safe = sanitizeForKey(filename)
    const y = new Date()
    const day = `${y.getUTCFullYear()}-${(y.getUTCMonth()+1).toString().padStart(2,'0')}-${y.getUTCDate().toString().padStart(2, '0')}`
    return `u/${userId}/${day}/${Date.now()}_${randomId(6)}_${safe}`
  }
  function buildCosUrl(key: string) {
    return `https://${Bucket}.cos.${Region}.myqcloud.com/${encodeURIComponent(key)}`
  }

  // 并发池
  async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, idx: number) => Promise<R>): Promise<R[]> {
    const ret: R[] = new Array(items.length) as R[]
    let i = 0
    let active = 0
    let resolveAll: (v: R[]) => void
    let rejectAll: (e: any) => void
    const done = new Promise<R[]>((resolve, reject) => { resolveAll = resolve; rejectAll = reject })
    const next = () => {
      while (active < limit && i < items.length) {
        const cur = i++
        active++
        worker(items[cur], cur)
          .then((r) => { ret[cur] = r })
          .catch((e) => { rejectAll(e) })
          .finally(() => {
            active--
            if (ret.length === items.length && active === 0 && i >= items.length) {
              resolveAll(ret)
            } else {
              next()
            }
          })
      }
      if (items.length === 0) resolveAll(ret)
    }
    next()
    return done
  }

  // 执行复制任务（含写库和 overwrite 删除旧文件记录）
  let copiedFiles = 0
  let skipped = plan.length - toCopy.length
  let failed = 0
  let successCopyBytes = 0
  let successFreedBytes = 0

  type CopyTask = {
    item: PlanItem
    destKey: string
    destUrl: string
  }
  const tasks: CopyTask[] = toCopy.map((p) => {
    const destKey = buildCosKey(userId, p.finalFilename)
    const destUrl = buildCosUrl(destKey)
    return { item: p, destKey, destUrl }
  })

  try {
    await runWithConcurrency(tasks, MAX_CONCURRENCY, async (task) => {
      const { item, destKey, destUrl } = task
      const { src, destFolderId, finalFilename, overwriteExisting } = item

      // 复制对象（COS 内部快速 Copy）
      await cosCopyObject(src.fileKey, destKey)

      // 成功后写入文件记录
      const contentType = src.contentType || 'application/octet-stream'
      const ins = await db
        .prepare('INSERT INTO files (user_id, folder_id, filename, file_key, file_size, file_url, content_type) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(userId, destFolderId, finalFilename, destKey, src.fileSize, destUrl, contentType)
        .run()
      copiedFiles++
      successCopyBytes += src.fileSize

      // 若 overwrite：复制成功后再删除旧记录与旧对象（避免先删导致失败后数据丢失）
      if (overwriteExisting) {
        await db.prepare('DELETE FROM files WHERE id = ?').bind(overwriteExisting.id).run()
        // 尝试删除旧对象（失败忽略，避免影响整体）
        if (overwriteExisting.fileKey && overwriteExisting.fileKey !== destKey) {
          await cosDeleteObject(overwriteExisting.fileKey).catch(() => {})
        }
        successFreedBytes += overwriteExisting.fileSize
      }
    })
  } catch (e: any) {
    // 并发复制过程中任一出错，统计失败数 = 余下未成功的任务数
    failed = tasks.length - copiedFiles
  }

  // 调整 usedStorage：预占是 reserveBytes，真实净增是 successCopyBytes - successFreedBytes
  const actualNet = Math.max(0, successCopyBytes - successFreedBytes)
  const delta = reserveBytes - actualNet
  if (delta > 0) {
    // 退还多占的空间
    await db.prepare('UPDATE users SET usedStorage = MAX(0, usedStorage - ?) WHERE id = ?').bind(delta, userId).run()
  } else if (delta < 0) {
    // 理论不应出现（实际比预占更多），兜底加上
    await db.prepare('UPDATE users SET usedStorage = usedStorage + ? WHERE id = ?').bind(-delta, userId).run()
  }

  // 最终兜底重算（一致性保障）
  await recalculateUsedStorage(db, userId)

  return {
    success: failed === 0,
    copied: { folders: folderIds.length, files: copiedFiles },
    skipped,
    failed,
    message: failed ? '部分文件复制失败' : '复制完成'
  }
})