export interface User {
  id: number
  email: string
  created_at: string
}

export interface AuthResponse {
  success: boolean
  message: string
  user?: User
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
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
