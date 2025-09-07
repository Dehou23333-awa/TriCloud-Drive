// server/api/manage/updateUserPermission.post.ts
import { defineEventHandler, readBody, createError } from 'h3';
import { getDb } from '~/server/utils/db-adapter';

export default defineEventHandler(async (event) => {
  if (getMethod(event) !== 'POST') {
    throw createError({
      statusCode: 405,
      statusMessage: 'Method not allowed'
    });
  }

  try {
    const { userId, permissionName, value } = await readBody(event);

    // 2. 验证输入参数
    if (!userId || !['IsAdmin', 'IsSuperAdmin'].includes(permissionName) || typeof value !== 'boolean') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid input: userId, permissionName, and boolean value are required.'
      });
    }

    // 3. 获取数据库实例
    const db = getDb(event);
    if (!db) {
      throw createError({
        statusCode: 500,
        statusMessage: '数据库连接失败'
      });
    }

    // 4. 执行数据库更新
    const sql = `UPDATE users SET ${permissionName} = ? WHERE id = ?`;
    await db.prepare(sql).bind(value ? 1 : 0, userId).run();

    return {
      success: true,
      message: `用户ID ${userId} 的 ${permissionName} 权限已更新为 ${value}`
    };
  } catch (error: any) {
    console.error('Error updating user permission:', error);
    if (error.statusCode) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error'
    });
  }
});