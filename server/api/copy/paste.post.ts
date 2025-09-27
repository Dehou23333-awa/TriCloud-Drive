import { defineEventHandler, readBody } from 'h3'
import { getDb } from '~/server/utils/db-adapter'
import { requireAuth } from '~/server/utils/auth-middleware'
import COS from 'cos-nodejs-sdk-v5'
import tencentcloud from 'tencentcloud-sdk-nodejs'
import crypto from 'node:crypto'

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
const getInsertId = (meta: any): number => meta?.lastID ?? meta?.insertId ?? meta?.last_row_id ?? meta?.inserted_id

// ========== 命名与冲突处理 ==========
function splitNameAndExt(filename: string) {
  const idx = filename.lastIndexOf('.')
  if (idx > 0 && idx < filename.length - 1) return { base: filename.slice(0, idx), ext: filename.slice(idx) }
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

// ========== 安全 Key 与 URL ==========
const COS_BUCKET = process.env.COS_BUCKET!
const COS_REGION = process.env.COS_REGION!
const COS_PUBLIC_HOST = process.env.COS_PUBLIC_HOST || '' // 建议设为你的 CDN 域名，如 https://tricloud-drive.domain.site

function ensureEnv() {
  if (!COS_BUCKET || !COS_REGION) throw new Error('缺少 COS_BUCKET / COS_REGION 环境变量')
}

function yyyymm(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}${m}`
}
function getExt(name: string) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}
function generateSafeObjectKey(userId: number, srcFilename: string) {
  const ext = getExt(srcFilename)
  return `users/${userId}/${yyyymm()}/${crypto.randomUUID()}${ext}`
}

// 使用 CDN 域名拼直链（前端再追加 sign）
function makeFileUrl(key: string) {
  const host = COS_PUBLIC_HOST.replace(/\/$/, '')
  if (host) return `${host}/${key}`
  // 兜底：COS 源站
  return `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${key}`
}

// ========== COS 客户端 & 复制 ==========
async function getCosClient() {
  ensureEnv()
  const SID = process.env.TENCENT_SECRET_ID
  const SKEY = process.env.TENCENT_SECRET_KEY
  const ROLE_ARN = process.env.TENCENT_STS_ROLE_ARN
  const SESSION_NAME = process.env.TENCENT_STS_SESSION_NAME || 'paste-copy-session'

  // 优先走 STS AssumeRole（需要配置 ROLE_ARN）
  if (SID && SKEY && ROLE_ARN) {
    const StsClient = tencentcloud.sts.v20180813.Client
    const client = new StsClient({
      credential: { secretId: SID, secretKey: SKEY },
      region: 'ap-guangzhou',
      profile: { httpProfile: { endpoint: 'sts.tencentcloudapi.com' } }
    })
    const appId = COS_BUCKET.split('-').pop()
    const policy = {
      version: '2.0',
      statement: [
        {
          effect: 'allow',
          action: [
            'name/cos:GetObject',
            'name/cos:HeadObject',
            'name/cos:PutObject',
            'name/cos:InitiateMultipartUpload',
            'name/cos:UploadPart',
            'name/cos:CompleteMultipartUpload',
            'name/cos:AbortMultipartUpload'
          ],
          resource: [
            `qcs::cos:${COS_REGION}:uid/${appId}:${COS_BUCKET}/*`
          ]
        }
      ]
    }
    const resp = await client.AssumeRole({
      RoleArn: ROLE_ARN,
      RoleSessionName: SESSION_NAME,
      Policy: JSON.stringify(policy),
      DurationSeconds: 3600
    })
    const cred = resp?.Credentials
    if (!cred?.TmpSecretId) throw new Error('STS 获取临时密钥失败')
    return new COS({
      SecretId: cred.TmpSecretId,
      SecretKey: cred.TmpSecretKey,
      XCosSecurityToken: cred.Token,
    })
  }

  // 退化：长密钥直连
  if (!SID || !SKEY) throw new Error('缺少 TENCENT_SECRET_ID/TENCENT_SECRET_KEY 或 STS 角色配置')
  return new COS({ SecretId: SID, SecretKey: SKEY })
}

async function cosCopyObject(cos: COS, srcKey: string, dstKey: string) {
  return new Promise((resolve, reject) => {
    cos.sliceCopyFile(
      {
        Bucket: COS_BUCKET,
        Region: COS_REGION,
        Key: dstKey.replace(/^\/+/, ''),
        CopySource: `${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${srcKey.replace(/^\/+/, '')}`
      },
      (err, data) => (err ? reject(err) : resolve(data))
    )
  })
}

// ========== 读取现有名称集 ==========
async function loadExistingNameSets(db: any, userId: number, parentId: number | null) {
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

  const folderSet = new Set<string>((f1?.results || []).map((r: any) => String(r.name)))
  const fileSet = new Set<string>((f2?.results || []).map((r: any) => String(r.filename)))
  return { folderSet, fileSet }
}

function nowSqlString(): string {
  const now = new Date()
  const Y = now.getFullYear()
  const M = String(now.getMonth() + 1).padStart(2, '0')
  const D = String(now.getDate()).padStart(2, '0')
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  return `${Y}-${M}-${D} ${h}:${m}:${s}`
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const userId = Number(user.userId)
  const db: any = getDb(event)
  if (!db) return { success: false, message: '数据库连接失败' }

  const body = await readBody<{
    targetFolderId: number | null
    folderIds?: number[]
    fileIds?: number[]
  }>(event)

  const targetFolderId = isNil(body.targetFolderId) ? null : Number(body.targetFolderId)
  const folderIds = Array.from(new Set((body.folderIds || []).map(Number))).filter((x) => Number.isInteger(x))
  const fileIds = Array.from(new Set((body.fileIds || []).map(Number))).filter((x) => Number.isInteger(x))

  // 校验目标文件夹归属
  if (targetFolderId !== null) {
    const targetRow = await db.prepare(
      'SELECT id FROM folders WHERE id = ? AND user_id = ?'
    ).bind(targetFolderId, userId).first()
    if (!targetRow) return { success: false, message: '目标文件夹不存在或无权限' }
  }

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

  // 复制整个文件夹树（总是新建安全 Key）
  async function copyFolderTree(
    cos: COS,
    root: RowFolder,
    dstParentId: number | null,
    nameSetsCache: {
      folderNames: Map<number | null, Set<string>>,
      fileNames: Map<number | null, Set<string>>
    },
    createdCosKeys: string[],
  ) {
    // 准备目标父级名称集
    let targetFolderSet = nameSetsCache.folderNames.get(dstParentId)
    if (!targetFolderSet) {
      const { folderSet, fileSet } = await loadExistingNameSets(db, userId, dstParentId)
      nameSetsCache.folderNames.set(dstParentId, folderSet)
      nameSetsCache.fileNames.set(dstParentId, fileSet)
      targetFolderSet = folderSet
    }

    // 文件夹名冲突：总是重命名（避免出现同层重复文件夹名）
    let newRootName = root.name
    if (targetFolderSet.has(newRootName)) {
      newRootName = nextUniqueName(newRootName, targetFolderSet)
    }

    // 插入新根文件夹
    const insRoot = await db.prepare(
      'INSERT INTO folders (user_id, parent_id, name) VALUES (?, ?, ?)'
    ).bind(userId, dstParentId, newRootName).run()
    const newRootId = getInsertId(insRoot.meta)
    targetFolderSet.add(newRootName)

    // 初始化子层集合
    nameSetsCache.folderNames.set(newRootId, new Set<string>())
    nameSetsCache.fileNames.set(newRootId, new Set<string>())

    const queue: Array<{ srcId: number, dstId: number }> = [{ srcId: root.id, dstId: newRootId }]
    let filesCopied = 0
    let foldersCopied = 1
    let bytesCopied = 0n

    while (queue.length) {
      const { srcId, dstId } = queue.shift()!

      // 复制当前文件夹下的所有文件
      const { results: srcFiles } = await db.prepare(
        'SELECT id, user_id, folder_id, filename, file_key, file_size, file_url, content_type FROM files WHERE user_id = ? AND folder_id = ?'
      ).bind(userId, srcId).all()

      let dstFileNameSet = nameSetsCache.fileNames.get(dstId)
      if (!dstFileNameSet) {
        const { fileSet } = await loadExistingNameSets(db, userId, dstId)
        dstFileNameSet = fileSet
        nameSetsCache.fileNames.set(dstId, dstFileNameSet)
      }

      for (const f of (srcFiles || [])) {
        const orig = f as RowFile
        const finalName = nextUniqueFileName(orig.filename, dstFileNameSet!)
        const dstKey = generateSafeObjectKey(userId, orig.filename)

        await cosCopyObject(cos, orig.file_key, dstKey)
        createdCosKeys.push(dstKey)

        await db.prepare(
          'INSERT INTO files (user_id, folder_id, filename, file_key, file_size, file_url, content_type) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          userId,
          dstId,
          finalName,
          dstKey,
          orig.file_size,
          makeFileUrl(dstKey),
          orig.content_type || 'application/octet-stream'
        ).run()

        dstFileNameSet!.add(finalName)
        filesCopied++
        bytesCopied += BigInt(orig.file_size || 0)
      }

      // 遍历子文件夹
      const { results: children } = await db.prepare(
        'SELECT id, user_id, parent_id, name FROM folders WHERE user_id = ? AND parent_id = ?'
      ).bind(userId, srcId).all()

      let dstFolderNameSet = nameSetsCache.folderNames.get(dstId)
      if (!dstFolderNameSet) {
        const { folderSet } = await loadExistingNameSets(db, userId, dstId)
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

        nameSetsCache.folderNames.set(newChildId, new Set<string>())
        nameSetsCache.fileNames.set(newChildId, new Set<string>())

        foldersCopied++
        queue.push({ srcId: child.id, dstId: newChildId })
      }
    }

    return { filesCopied, foldersCopied, bytesCopied }
  }

  // ========== 主流程 ==========
  const cos = await getCosClient()
  await db.prepare('BEGIN').bind().run()

  // 用于失败补偿：记住已创建的新对象 Key，失败时删除
  const createdCosKeys: string[] = []

  try {
    const nameSetsCache = {
      folderNames: new Map<number | null, Set<string>>(),
      fileNames: new Map<number | null, Set<string>>()
    }
    const firstSets = await loadExistingNameSets(db, userId, targetFolderId)
    nameSetsCache.folderNames.set(targetFolderId, firstSets.folderSet)
    nameSetsCache.fileNames.set(targetFolderId, firstSets.fileSet)

    let totalFiles = 0
    let totalFolders = 0
    let totalBytes = 0n

    // 复制选中的文件夹（全量，使用安全 Key）
    if (folderIds.length) {
      const srcFolders = await fetchFoldersByIds(folderIds)
      if (srcFolders.length !== folderIds.length) throw new Error('部分文件夹不存在或无权限')
      for (const root of srcFolders) {
        const res = await copyFolderTree(cos, root, targetFolderId, nameSetsCache, createdCosKeys)
        totalFiles += res.filesCopied
        totalFolders += res.foldersCopied
        totalBytes += res.bytesCopied
      }
    }

    // 复制选中的文件到目标父级（使用安全 Key）
    if (fileIds.length) {
      const srcFiles = await fetchFilesByIds(fileIds)
      if (srcFiles.length !== fileIds.length) throw new Error('部分文件不存在或无权限')

      let dstFileNameSet = nameSetsCache.fileNames.get(targetFolderId)!
      for (const f of srcFiles) {
        const finalName = nextUniqueFileName(f.filename, dstFileNameSet)
        const dstKey = generateSafeObjectKey(userId, f.filename)

        await cosCopyObject(cos, f.file_key, dstKey)
        createdCosKeys.push(dstKey)

        await db.prepare(
          'INSERT INTO files (user_id, folder_id, filename, file_key, file_size, file_url, content_type) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          userId,
          targetFolderId,
          finalName,
          dstKey,
          f.file_size,
          makeFileUrl(dstKey),
          f.content_type || 'application/octet-stream'
        ).run()

        dstFileNameSet.add(finalName)
        totalFiles++
        totalBytes += BigInt(f.file_size || 0)
      }
    }

    // usedStorage 配额校验 + 叠加（失败会导致整单回滚并删除已创建对象）
    if (totalBytes !== 0n) {
      const upd = await db.prepare(`
        UPDATE users
        SET usedStorage = usedStorage + ?
        WHERE id = ?
          AND (maxStorage = 0 OR usedStorage + ? <= maxStorage)
          AND (expire_at IS NULL OR expire_at > ?)
      `).bind(Number(totalBytes), userId, Number(totalBytes), nowSqlString()).run()
      const changes = (upd as any)?.meta?.changes ?? 0
      if (changes !== 1) throw new Error('存储空间不足或账号已过期，复制被拒绝')
    }

    await db.prepare('COMMIT').bind().run()
    return {
      success: true,
      affected: { folders: totalFolders, files: totalFiles, bytes: Number(totalBytes) }
    }
  } catch (err: any) {
    await db.prepare('ROLLBACK').bind().run()
    // 失败补偿：尝试删除创建的新对象
    try {
      if (createdCosKeys.length) {
        const cos2 = await getCosClient()
        await Promise.allSettled(
          createdCosKeys.map(key => new Promise<void>((resolve) => {
            cos2.deleteObject({ Bucket: COS_BUCKET, Region: COS_REGION, Key: key }, () => resolve())
          }))
        )
      }
    } catch {}
    return { success: false, message: err?.message || '复制失败' }
  }
})