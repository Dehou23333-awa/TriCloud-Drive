# TriCloud Drive

基于 Nuxt 3 ， Cloudflare D1/Sqlite3，腾讯云存储桶+CDN 的云存储应用，具备完整的用户认证功能。

## 功能特性

- ✅ 用户注册和登录
- ✅ 基于 JWT 的认证系统
- ✅ 密码加密存储
- ✅ 响应式设计
- ✅ Cloudflare D1/ Sqlite3 数据库双兼容
- ✅ 腾讯云存储桶+CDN 云存储
- ✅ 用户下载和存储配额
- 🚧 管理（开发中）
- 🚧 文件上传下载（开发中）

## 技术栈

- **前端**: Nuxt 3, Vue 3, TailwindCSS
- **后端**: Nitro, Cloudflare Workers
- **数据库**: Cloudflare D1 (SQLite)/Sqlite3
- **认证**: JWT, bcrypt
- **云存储**: 腾讯云存储桶+CDN

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化数据库

- Sqlite3 数据库初始化

```bash
sqlite3 data.sqlite < ./server/database/schema.sql
```
**或**

- Cloudflare D1 数据库初始化

```bash
npx wrangler d1 execute tricloud-drive --local --file=server/database/schema.sql
```

### 3. 配置环境变量

```bash
cp env.example .env
```

**或对于Windows用户**

```batch
copy env.example .env
```

并把.env 文件中的配置改成你自己的配置。

### 4. 启动开发服务器

```bash
npm run dev
```

应用将在 http://localhost:3000 启动。

## 用户认证功能

### 注册新用户

1. 访问 `/register` 页面
2. 输入邮箱和密码（密码至少8位，包含字母和数字）
3. 确认密码
4. 点击注册按钮

> 如果你要关闭注册，请在.env 文件中设置 `ALLOW_REGISTER` 为 `false`

### 用户登录

1. 访问 `/login` 页面
2. 输入注册时的邮箱和密码
3. 点击登录按钮

### 认证状态

- 登录成功后，用户信息会保存在状态中
- 使用 HttpOnly Cookie 存储 JWT 令牌
- 自动检查认证状态
- 提供退出登录功能

### 退出登录

1. 点击导航栏`退出登录`按钮。

### 用户管理

1. 访问 `/manage` 页面
2. 可以搜索，添加，删除用户，也可以管理用户权限（待完善）

> 用户注册时 `IsAdmin` 和 `IsSuperAdmin` 默认为 `false` 。管理员请手动修改数据库。之后就可以在管理页面修改其他用户权限。


## API 端点

### 认证 API

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/logout` - 用户退出
- `GET /api/auth/me` - 获取当前用户信息
- `GET /api/auth/isAdminOrSuperAdmin` - 检查当前用户是否为管理员或超级管理员

### 请求格式

#### 注册
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

#### 登录
```json
{
  "email": "user@example.com", 
  "password": "password123"
}
```

### 响应格式

#### 成功响应
```json
{
  "success": true,
  "message": "操作成功",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "created_at": "2025-08-15T12:00:00.000Z"
  }
}
```

#### 错误响应
```json
{
  "statusCode": 400,
  "statusMessage": "错误信息"
}
```

## 数据库结构

### users 表

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  IsAdmin BOOLEAN DEFAULT 0,
  IsSuperAdmin BOOLEAN DEFAULT 0,
  usedStorage INTEGER DEFAULT 0,
  maxStorage INTEGER DEFAULT 1,
  usedDownload INTEGER DEFAULT 0,
  maxDownload INTEGER DEFAULT 1
);
```

## 部署到 Cloudflare(待完善)

### 1. 创建 D1 数据库

```bash
npx wrangler d1 create tricloud-drive
```

### 2. 更新 wrangler.toml

将返回的数据库 ID 填入 `wrangler.toml` 的 `database_id` 字段。

### 3. 初始化远程数据库

```bash
npx wrangler d1 execute tricloud-drive --remote --file=server/database/schema.sql
```

### 4. 部署应用

```bash
npm run build
npx wrangler pages deploy dist
```

## 环境变量

- `SESSION_SECRET`: JWT 签名密钥（生产环境必须设置）

## 安全特性

- 密码使用 bcrypt 加密存储
- JWT 令牌存储在 HttpOnly Cookie 中
- 输入验证和错误处理
- 防止 SQL 注入（使用预处理语句）

