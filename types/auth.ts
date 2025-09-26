export interface User {
  id: number
  email: string
  created_at: string
  IsAdmin: boolean
  IsSuperAdmin: boolean
  usedStorage: number
  maxStorage: number
  usedDownload: number
  maxDownload: number
  expire_at: string | null
}

export interface AuthResponse {
  success: boolean
  message: string
  user?: User
}

export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  email: string
  username: string
  password: string
}

export interface ApiError {
  statusCode: number
  statusMessage: string
}

declare global {
  interface CloudflareEnv {
    DB: any
    SESSION_SECRET?: string
  }
}
