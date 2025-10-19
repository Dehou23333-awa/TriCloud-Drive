import { Database } from '~/server/utils/db'
import { FileRecord } from '~/types/files'
import { GeneralResponse } from '~/types/auth'
import { skipAndOverwriteError, ServerError } from '~/types/error'

export function splitName(filename: string): { base: string, ext: string } {
    const i = filename.lastIndexOf('.')
    if (i <= 0) return { base: filename, ext: '' }
    return { base: filename.slice(0, i), ext: filename.slice(i) }
}

export function escapeLike(input: string): string {
    return input.replace(/([%_\\])/g, '\\$1')
}

export function escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function resolveUniqueFilename(db: Database, userId: number, folderId: number | null, desired: string): Promise<{ name: string, base: string, ext: string, nextN: number }> {
    const { base, ext } = splitName(desired)
    const likePattern = `${escapeLike(base)} (%)${escapeLike(ext)}`
    let rows
    if (folderId === null) {
        rows = await db.prepare(`
    SELECT filename FROM files
    WHERE user_id = ? AND folder_id IS NULL
        AND (filename = ? OR filename LIKE ? ESCAPE '\\')
    `).bind(userId, desired, likePattern).all()
    } else {
        rows = await db.prepare(`
    SELECT filename FROM files
    WHERE user_id = ? AND folder_id = ?
        AND (filename = ? OR filename LIKE ? ESCAPE '\\')
    `).bind(userId, folderId, desired, likePattern).all()
    }
    const existing = new Set<string>((rows?.results || []).map((r: any) => String(r.filename)))
    if (!existing.has(desired)) {
        return { name: desired, base, ext, nextN: 1 }
    }
    // 找到现有最大 (n)
    const re = new RegExp(`^${escapeRegExp(base)} \\((\\d+)\\)${escapeRegExp(ext)}$`)
    let maxN = 1
    for (const name of existing) {
        const m = name.match(re)
        if (m) {
            const n = parseInt(m[1], 10)
            if (Number.isFinite(n) && n > maxN) maxN = n
        }
    }
    const nextN = maxN + 1
    return { name: `${base} (${nextN})${ext}`, base, ext, nextN }
}


export async function save(db: Database, file: FileRecord, userId: number, folderId: number | null, overwrite: boolean, skipIfExist: boolean): Promise<GeneralResponse> {
    if (overwrite && skipIfExist) {
        throw skipAndOverwriteError
    }
    // 将 0/undefined 视为根目录（NULL）
    const folderIdVal =
        Number.isFinite(folderId) && Number(folderId) > 0 ? Number(folderId) : null
    const filename = file.filename?.trim()

    if (!overwrite && !skipIfExist) {
        
        const newFilename = (await resolveUniqueFilename(db, userId, folderId, filename)).name
        if (newFilename !== filename && skipIfExist) {
            return { success: true }
        }


        const sql = `
            INSERT INTO files
            (user_id, folder_id, filename, file_key, file_size, file_url, content_type, created_at)
            VALUES
            (?, ?, ?, ?, ?, ?, ?, ?)
            `

        const params = [
            Number(userId),
            folderIdVal,
            newFilename,
            file.fileKey,
            Number(file.fileSize),
            file.fileUrl,
            file.contentType || null,
            file.createdAt,
        ]
        await db.prepare(sql).bind(...params).run()
        return { success: true }
    }
    else if (overwrite)
    {
        const sql = `
            INSERT INTO files (
            user_id, folder_id, filename, file_key, file_size, file_url, content_type, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(folder_id, filename)
            DO UPDATE SET
            file_key     = excluded.file_key,
            file_size    = excluded.file_size,
            file_url     = excluded.file_url,
            content_type = excluded.content_type,
            created_at   = excluded.create_at;
        `
        const params = [
            Number(userId),
            folderIdVal,
            filename,
            file.fileKey,
            Number(file.fileSize),
            file.fileUrl,
            file.contentType || null,
            file.createdAt,
        ]
        return { success: true }
    } else if (skipIfExist)
    {
        const stmt = db.prepare(`
        INSERT OR IGNORE INTO files (
            user_id, folder_id, filename, file_key, file_size, file_url, content_type,created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        const params = [
            Number(userId),
            folderIdVal,
            filename,
            file.fileKey,
            Number(file.fileSize),
            file.fileUrl,
            file.contentType || null,
            file.createdAt,
        ]
        const result = await stmt.bind(...params).run()
        if (Number(result.meta.changes) === 1)  // 0 = 已存在, 1 = 新增
        {
            return { success: true }
        }
        else return { success: false }
    } else
    {
        throw ServerError
    }
}
export async function getFileById(db: Database, fileId: number): Promise<FileRecord | null> {

    const row = await db
        .prepare(`
      SELECT
        id,
        folder_id    AS folderId,
        filename,
        file_key     AS fileKey,
        file_size    AS fileSize,
        file_url     AS fileUrl,
        content_type AS contentType,
        created_at   AS createdAt
      FROM files
      WHERE id = ?
    `)
        .bind(fileId)
        .first()

    if (!row) return null

    // 兼容 MySQL 可能把 BIGINT 返回为字符串的情况
    const fileSize =
        typeof row.fileSize === 'string' ? Number(row.fileSize) : (row.fileSize ?? 0)

    const folderId =
        row.folderId === null || row.folderId === undefined ? null : Number(row.folderId)

    const record: FileRecord = {
        id: Number(row.id),
        folderId,
        filename: String(row.filename),
        fileKey: String(row.fileKey),
        fileSize,
        fileUrl: String(row.fileUrl),
        contentType: row.contentType ? String(row.contentType) : '',
        createdAt: String(row.createdAt)
    }

    return record
}