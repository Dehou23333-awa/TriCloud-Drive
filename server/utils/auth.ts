import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12
  return await bcrypt.hash(password, saltRounds)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash)
}

export function generateToken(userId: number, secret: string): string {
  return jwt.sign({ userId }, secret, { expiresIn: '7d' })
}

export function verifyToken(token: string, secret: string): { userId: number } | null {
  try {
    const decoded = jwt.verify(token, secret) as { userId: number }
    return decoded
  } catch (error) {
    console.error('Token verification failed:', error)
    return null
  }
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function validatePassword(password: string): boolean {
  // 至少8位，包含字母和数字
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password)
}

export function validateUsername(username: string): boolean {
  // 只能包含字母和数字
  const trimmed = username.trim()
  const regex = /^[A-Za-z0-9]+$/
  return regex.test(trimmed)
}
