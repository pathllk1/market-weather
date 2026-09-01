import { initTursoSchema, getTursoClient } from '../utils/turso'
import { hashPassword } from '../utils/crypto'

export default defineNitroPlugin(async () => {
  try {
    // 1. Initialize schema and tables
    await initTursoSchema()

    // 2. Bootstrap initial admin account if users table is empty
    const db = getTursoClient()
    const usersCountRes = await db.execute('SELECT COUNT(*) as count FROM users')
    const countRow = usersCountRes.rows[0]
    const count = countRow ? Number(countRow.count || 0) : 0

    if (count === 0) {
      const config = useRuntimeConfig()
      const adminEmail = (config.initialAdminEmail || 'admin@security.enterprise').toLowerCase().trim()
      const adminPassword = config.initialAdminPassword || 'AdminSecure#2026@Defense!'

      const { hash, salt } = await hashPassword(adminPassword)
      const nowIso = new Date().toISOString()
      const username = adminEmail.split('@')[0] || 'admin'
      const fullname = 'Security Administrator'

      await db.execute({
        sql: `
          INSERT INTO users (
            username, email, fullname, password, password_hash, salt, role, failed_attempts, locked_until, is_active, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, 'admin', 0, NULL, 1, ?, ?)
        `,
        args: [username, adminEmail, fullname, hash, hash, salt, nowIso, nowIso]
      })

      console.log(`[SECURITY ENGINE] Default admin account bootstrapped: ${adminEmail}`)
    }
  } catch (err) {
    console.error('[SECURITY ENGINE] Failed to initialize Turso database:', err)
  }
})
