export interface User {
  id: number
  email: string
  username: string
  password_hash: string
  created_at: string
  IsAdmin: boolean
  IsSuperAdmin: boolean
  usedStorage: number
  maxStorage: number
  usedDownload: number
  maxDownload: number
  expire_at: string
  canChangePassword: boolean
}

export interface Database {
  prepare(query: string): {
    bind(...args: any[]): {
      first(): Promise<any>
      all(): Promise<{ results: any[] }>
      run(): Promise<{ success: boolean; meta: any }>
    }
  }
}

export class UserService {
  private db: Database

  constructor(db: Database) {
    this.db = db
  }

  async createUser(email: string, username: string, passwordHash: string): Promise<User | null> {
    try {
      const result = await this.db
        .prepare('INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?) RETURNING *')
        .bind(email, username, passwordHash)
        .first()
      
      return result as User
    } catch (error) {
      console.error('Error creating user:', error)
      return null
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const user = await this.db
        .prepare('SELECT * FROM users WHERE email = ?')
        .bind(email)
        .first()
      
      return user as User || null
    } catch (error) {
      console.error('Error getting user by email:', error)
      return null
    }
  }
  async getUserByUsername(username: string): Promise<User | null> {
    try {
      const user = await this.db
        .prepare('SELECT * FROM users WHERE username = ?')
        .bind(username)
        .first()
      
      return user as User || null
    } catch (error) {
      console.error('Error getting user by username:', error)
      return null
    }
  }

  async getUserById(id: number): Promise<User | null> {
    try {
      const user = await this.db
        .prepare('SELECT * FROM users WHERE id = ?')
        .bind(id)
        .first()
      
      return user as User || null
    } catch (error) {
      console.error('Error getting user by id:', error)
      return null
    }
  }
}
