import express from "express";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import cors from "cors";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static HTML from /public
app.use(express.static(path.join(__dirname, "public")));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireAnyRole(allowedRoles) {
  return (req, res, next) => {
    const roles = req.user?.roles || [];
    if (!roles.some(r => allowedRoles.includes(r))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

async function getUserWithRolesByEmail(email) {
  const [users] = await pool.query(
    `SELECT user_id, email, full_name, password_hash, is_active
     FROM app_users
     WHERE email = ?`,
    [email]
  );
  if (users.length === 0) return null;

  const user = users[0];
  const [roles] = await pool.query(
    `SELECT r.role_name
     FROM app_user_roles ur
     JOIN app_roles r ON r.role_id = ur.role_id
     WHERE ur.user_id = ?`,
    [user.user_id]
  );

  return { ...user, roles: roles.map(r => r.role_name) };
}

// Health
app.get("/api/health", async (req, res) => {
  const [rows] = await pool.query("SELECT 1 AS ok");
  res.json({ ok: rows[0].ok === 1 });
});

// DB test
app.get("/api/db-test", authRequired, async (req, res) => {
  const [rows] = await pool.query("SHOW TABLES");
  res.json(rows);
});

// Bootstrap admin
app.post("/api/bootstrap-admin", async (req, res) => {
  const { email, full_name, password } = req.body;
  if (!email || !full_name || !password) {
    return res.status(400).json({ error: "email, full_name, password required" });
  }

  const password_hash = await bcrypt.hash(password, 12);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query(`SELECT user_id FROM app_users WHERE email = ?`, [email]);
    if (existing.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: "User already exists" });
    }

    const [ins] = await conn.query(
      `INSERT INTO app_users (email, full_name, password_hash) VALUES (?, ?, ?)`,
      [email, full_name, password_hash]
    );
    const user_id = ins.insertId;

    const [roleRows] = await conn.query(`SELECT role_id FROM app_roles WHERE role_name = 'Admin'`);
    if (roleRows.length === 0) {
      await conn.rollback();
      return res.status(500).json({ error: "Admin role not found" });
    }

    await conn.query(`INSERT INTO app_user_roles (user_id, role_id) VALUES (?, ?)`, [
      user_id,
      roleRows[0].role_id
    ]);

    await conn.commit();
    res.json({ ok: true, user_id });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: "bootstrap failed", message: err.message });
  } finally {
    conn.release();
  }
});
// Login
// Register new user (email + password)
app.post("/api/register", async (req, res) => {
  try {
    const { email, full_name, password } = req.body;

    if (!email || !full_name || !password) {
      return res.status(400).json({ error: "email, full_name, and password required" });
    }

    if (password.length < 12) {
      return res.status(400).json({ error: "Password must be at least 12 characters" });
    }

    // Check for existing email
    const [existing] = await pool.query(
      `SELECT user_id FROM app_users WHERE email = ?`,
      [email]
    );

    if (existing.length) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);

    // Create user
    const [result] = await pool.query(
      `INSERT INTO app_users (email, full_name, password_hash, is_active)
       VALUES (?, ?, ?, 1)`,
      [email, full_name, password_hash]
    );

    const userId = result.insertId;

    // Assign default role: Staff (role_id = 4)
    await pool.query(
      `INSERT INTO app_user_roles (user_id, role_id)
       VALUES (?, ?)`,
      [userId, 4]
    );

    res.status(201).json({ ok: true });
  } catch (err) {
    console.error("register error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const user = await getUserWithRolesByEmail(email);
    if (!user || !user.is_active) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    await pool.query(`UPDATE app_users SET last_login_at = NOW() WHERE user_id = ?`, [user.user_id]);

    const token = jwt.sign(
      { user_id: user.user_id, email: user.email, full_name: user.full_name, roles: user.roles },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      token,
      user: { user_id: user.user_id, email: user.email, full_name: user.full_name, roles: user.roles }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Change password (requires current password)
app.post("/api/change-password", authRequired, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: "current_password and new_password required" });
    }

    const hasNumber = /[0-9]/.test(new_password);
    const hasSymbol = /[^A-Za-z0-9]/.test(new_password);

    if (new_password.length < 12 || !hasNumber || !hasSymbol) {
      return res.status(400).json({
        error: "Password must be at least 12 characters and include at least 1 number and 1 symbol"
      });
    }

    const userId = req.user.user_id;

    const [rows] = await pool.query(
      `SELECT password_hash, is_active FROM app_users WHERE user_id = ?`,
      [userId]
    );

    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const ok = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const newHash = await bcrypt.hash(new_password, 12);

    await pool.query(
      `UPDATE app_users SET password_hash = ? WHERE user_id = ?`,
      [newHash, userId]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// KPI endpoints
app.get("/api/kpi/org-monthly", authRequired, requireAnyRole(["Executive", "Admin"]), async (req, res) => {
  const [rows] = await pool.query(`SELECT * FROM v_exec_org_monthly ORDER BY month_start DESC LIMIT 24`);
  res.json(rows);
});

app.get("/api/kpi/program-monthly", authRequired, requireAnyRole(["ProgramDirector", "Executive", "Admin"]), async (req, res) => {
  const [rows] = await pool.query(`SELECT * FROM v_program_monthly ORDER BY month_start DESC, program_name ASC LIMIT 500`);
  res.json(rows);
});

app.get("/api/kpi/staff-caseload", authRequired, requireAnyRole(["Executive", "Admin"]), async (req, res) => {
  const [rows] = await pool.query(`SELECT * FROM v_staff_caseload_active ORDER BY active_caseload DESC, full_name ASC`);
  res.json(rows);
});

// Lookups
app.get("/api/lookups/programs", authRequired, async (req, res) => {
  const [rows] = await pool.query(`SELECT program_id, program_name FROM programs WHERE is_active = 1 ORDER BY program_name`);
  res.json(rows);
});

app.get("/api/lookups/staff", authRequired, async (req, res) => {
  const [rows] = await pool.query(`SELECT staff_id, full_name FROM staff WHERE is_active = 1 ORDER BY full_name`);
  res.json(rows);
});

app.get("/api/lookups/services", authRequired, async (req, res) => {
  const [rows] = await pool.query(`SELECT service_id, service_type FROM services ORDER BY service_type`);
  res.json(rows);
});
app.get("/api/lookups/clients", authRequired, async (req, res) => {
  const q = (req.query.q || "").trim();
  if (!q) return res.json([]);

  const like = `%${q}%`;

  const [rows] = await pool.query(
    `
    SELECT client_id, external_client_key, first_name, last_name
    FROM clients
    WHERE is_active = 1
      AND (
        external_client_key LIKE ?
        OR first_name LIKE ?
        OR last_name LIKE ?
      )
    ORDER BY last_name, first_name
    LIMIT 20
    `,
    [like, like, like]
  );

  res.json(rows);
});
// Create client
app.post("/api/clients", authRequired, async (req, res) => {
  const {
    external_client_key,
    first_name,
    last_name,
    dob,
    gender,
    housing_status
  } = req.body || {};

  if (!first_name || !last_name) {
    return res.status(400).json({ error: "First name and last name are required" });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO clients
        (external_client_key, first_name, last_name, dob, gender, housing_status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        external_client_key || null,
        first_name.trim(),
        last_name.trim(),
        dob || null,
        gender || null,
        housing_status || null
      ]
    );

    res.json({ client_id: result.insertId });
  } catch (err) {
    console.error("Create client error:", err);
    res.status(500).json({ error: "Failed to create client" });
  }
});
app.put("/api/clients/:id", authRequired, requireAnyRole(["Staff", "Admin"]), async (req, res) => {
  try {
    const client_id = Number(req.params.id);
    if (!client_id) return res.status(400).json({ error: "Invalid client id" });

    const {
      external_client_key,
      first_name,
      last_name,
      dob,
      gender,
      housing_status
    } = req.body || {};

    if (!external_client_key || !first_name || !last_name) {
      return res.status(400).json({ error: "external_client_key, first_name, last_name are required" });
    }

    await pool.query(
      `UPDATE clients
       SET external_client_key = ?, first_name = ?, last_name = ?, dob = ?, gender = ?, housing_status = ?
       WHERE client_id = ?`,
      [
        external_client_key.trim(),
        first_name.trim(),
        last_name.trim(),
        dob || null,
        gender || null,
        housing_status || null,
        client_id
      ]
    );

    res.json({ ok: true, client_id });
  } catch (err) {
    console.error("Update client error:", err);
    res.status(500).json({ error: "Failed to update client" });
  }
});
// Create client
app.post("/api/clients", authRequired, requireAnyRole(["Staff", "Admin"]), async (req, res) => {
  const {
    external_client_key,
    first_name,
    last_name,
    dob,
    gender,
    housing_status
  } = req.body || {};

  if (!external_client_key || !first_name || !last_name) {
    return res.status(400).json({
      error: "external_client_key, first_name, and last_name are required"
    });
  }

  try {
    const [result] = await pool.query(
      `
      INSERT INTO clients
      (external_client_key, first_name, last_name, dob, gender, housing_status)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        external_client_key.trim(),
        first_name.trim(),
        last_name.trim(),
        dob || null,
        gender || null,
        housing_status || null
      ]
    );

    res.json({ client_id: result.insertId });
  } catch (err) {
    console.error("Create client error:", err);
    res.status(500).json({ error: "Failed to create client" });
  }
});
// Data entry
app.post("/api/data/add-service", authRequired, requireAnyRole(["Staff", "Admin"]), async (req, res) => {
  const { client_id, program_id, staff_id, service_id, service_date, duration_minutes, notes_ref } = req.body;

  if (!client_id || !program_id || !service_id || !service_date || !duration_minutes) {
    return res.status(400).json({ error: "client_id, program_id, service_id, service_date, duration_minutes required" });
  }

  const [result] = await pool.query(
    `INSERT INTO client_services
      (client_id, program_id, staff_id, service_id, service_date, duration_minutes, notes_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [client_id, program_id, staff_id || null, service_id, service_date, duration_minutes, notes_ref || null]
  );

  res.json({ ok: true, client_service_id: result.insertId });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
