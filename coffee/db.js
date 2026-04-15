// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import bodyParser from "body-parser";
import mysql from "mysql2";
import multer from "multer";
import path from "path";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";

dotenv.config();
const app = express();
const server = http.createServer(app);

// ✅ Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// ✅ Middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

const ordersRouter = express.Router();
// ✅ Ensure uploads folder exists
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// ✅ Serve static images
app.use("/uploads", express.static("uploads"));


// ✅ MySQL Connection
const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "f_and_f_coffee",
});

db.connect((err) => {
  if (err) {
    console.error("❌ MySQL connection failed:", err);
  } else {
    console.log("✅ Connected to MySQL Database");
  }
});

// ✅ Email setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ✅ Helper: generate 6-digit reset code
function generateResetCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ✅ Multer setup for menu image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// =============================
// 📦 DATABASE TABLE CREATION
// =============================
db.query(
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(20),
    password VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`
);

db.query(
  `CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255),
    reset_code VARCHAR(10),
    reset_expiry BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`
);

db.query(
  `CREATE TABLE IF NOT EXISTS menu (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255),
    price DECIMAL(10,2),
    currency VARCHAR(10),
    description TEXT,
    image VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`
);

db.query(
  `CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255),
    table_id VARCHAR(50),
    date DATE,
    time TIME,
    status VARCHAR(50) DEFAULT 'Pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`
);

// =============================
// 👤 USER AUTH ROUTES
// =============================

// ✅ User Signup
app.post("/api/signup", (req, res) => {
  const { username, email, phone, password, confirmPassword } = req.body;
  if (!username || !email || !phone || !password || !confirmPassword)
    return res.status(400).json({ message: "All fields are required." });
  if (password !== confirmPassword)
    return res.status(400).json({ message: "Passwords do not match." });

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (results.length > 0)
      return res.status(400).json({ message: "Email already exists." });

    const hashed = await bcrypt.hash(password, 10);
    db.query(
      "INSERT INTO users (username, email, phone, password) VALUES (?, ?, ?, ?)",
      [username, email, phone, hashed],
      (err) => {
        if (err) return res.status(500).json({ message: "Database error" });
        res.status(201).json({ message: "Account created successfully!" });
      }
    );
  });
});

// ✅ User Login
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email and password required." });

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (results.length === 0)
      return res.status(400).json({ message: "Invalid email or password." });

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ message: "Invalid email or password." });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful.",
      token,
      username: user.username,
      email: user.email,
      phone: user.phone,
    });
  });
});

// ✅ Forgot Password (User)
app.post("/api/forgot-password", (req, res) => {
  const { email } = req.body;
  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (results.length === 0)
      return res.status(400).json({ message: "Email not found." });

    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "15m" });
    const resetLink = `http://localhost:3000/reset-password/${token}`;

    transporter.sendMail(
      {
        from: `"F&F Coffee" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "Password Reset Request",
        html: `<h3>Password Reset</h3>
               <p>Click below to reset your password (valid 15 mins):</p>
               <a href="${resetLink}">${resetLink}</a>`,
      },
      (err) => {
        if (err) return res.status(500).json({ message: "Failed to send email" });
        res.json({ message: "Password reset link sent to your email." });
      }
    );
  });
});

// ✅ Reset Password (User)
app.post("/api/reset-password/:token", (req, res) => {
  const { token } = req.params;
  const { newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ message: "Password required" });

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(400).json({ message: "Invalid or expired token" });

    const hashed = await bcrypt.hash(newPassword, 10);
    db.query("UPDATE users SET password = ? WHERE email = ?", [hashed, decoded.email], (err) => {
      if (err) return res.status(500).json({ message: "Database error" });
      res.json({ message: "Password reset successfully" });
    });
  });
});

// =============================
// 👑 ADMIN AUTH ROUTES
// =============================

// ✅ Admin Register
app.post("/api/admin/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ success: false, message: "All fields required" });

  const [existing] = await db.promise().query("SELECT * FROM admins WHERE email = ?", [email]);
  if (existing.length > 0)
    return res.status(400).json({ success: false, message: "Email already exists" });

  const hashed = await bcrypt.hash(password, 10);
  await db
    .promise()
    .query("INSERT INTO admins (username, email, password) VALUES (?, ?, ?)", [
      username,
      email,
      hashed,
    ]);

  res.json({ success: true, message: "Admin registered successfully" });
});

// ✅ Admin Login
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await db.promise().query("SELECT * FROM admins WHERE email = ?", [email]);
  if (rows.length === 0)
    return res.status(400).json({ success: false, message: "Invalid credentials" });

  const admin = rows[0];
  const valid = await bcrypt.compare(password, admin.password);
  if (!valid)
    return res.status(400).json({ success: false, message: "Invalid credentials" });

  const token = jwt.sign(
    { id: admin.id, email: admin.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({
    success: true,
    message: "Login successful",
    token,
    admin: { id: admin.id, username: admin.username, email: admin.email },
  });
});

// ✅ Admin Forgot Password (6-digit code)
app.post("/api/admin/forgot", async (req, res) => {
  const { email } = req.body;
  const [rows] = await db.promise().query("SELECT * FROM admins WHERE email = ?", [email]);
  if (rows.length === 0)
    return res.status(400).json({ success: false, message: "Email not found" });

  const code = generateResetCode();
  const expiry = Date.now() + 10 * 60 * 1000;
  await db
    .promise()
    .query("UPDATE admins SET reset_code = ?, reset_expiry = ? WHERE email = ?", [
      code,
      expiry,
      email,
    ]);

  await transporter.sendMail({
    from: `"F&F Coffee Admin" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Your Password Reset Code",
    html: `<h3>Your Reset Code</h3><h2>${code}</h2><p>Expires in 10 minutes.</p>`,
  });

  res.json({ success: true, message: "Reset code sent to your email" });
});

// ✅ Verify Reset Code
app.post("/api/admin/reset/verify", async (req, res) => {
  const { email, code } = req.body;
  const [rows] = await db
    .promise()
    .query("SELECT * FROM admins WHERE email = ? AND reset_code = ?", [email, code]);
  if (rows.length === 0)
    return res.status(400).json({ success: false, message: "Invalid reset code" });

  const admin = rows[0];
  if (Date.now() > admin.reset_expiry)
    return res.status(400).json({ success: false, message: "Code expired" });

  res.json({ success: true, message: "Code verified" });
});

// ✅ Reset Admin Password
app.post("/api/admin/reset", async (req, res) => {
  const { email, code, newPassword } = req.body;
  const [rows] = await db
    .promise()
    .query("SELECT * FROM admins WHERE email = ? AND reset_code = ?", [email, code]);
  if (rows.length === 0)
    return res.status(400).json({ success: false, message: "Invalid reset code" });

  const admin = rows[0];
  if (Date.now() > admin.reset_expiry)
    return res.status(400).json({ success: false, message: "Code expired" });

  const hashed = await bcrypt.hash(newPassword, 10);
  await db
    .promise()
    .query(
      "UPDATE admins SET password = ?, reset_code = NULL, reset_expiry = NULL WHERE email = ?",
      [hashed, email]
    );

  res.json({ success: true, message: "Password reset successfully" });
});

// =============================
// ☕ MENU ROUTES
// =============================
app.get("/api/menu", (req, res) => {
  db.query("SELECT * FROM menu ORDER BY id DESC", (err, results) => {
    if (err) return res.status(500).json({ error: "Failed to fetch menu" });
    res.json(results);
  });
});

app.post("/api/menu", upload.single("image"), (req, res) => {
  const { name, price, currency, description } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : "";
  if (!name || !price || !currency)
    return res.status(400).json({ error: "Missing fields" });

  db.query(
    "INSERT INTO menu (name, price, currency, description, image) VALUES (?, ?, ?, ?, ?)",
    [name, price, currency, description, image],
    (err, result) => {
      if (err) return res.status(500).json({ error: "Failed to add menu item" });
      res.json({ success: true, message: "Menu item added", id: result.insertId });
    }
  );
});

app.delete("/api/menu/:id", (req, res) => {
  db.query("DELETE FROM menu WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "Failed to delete menu item" });
    res.json({ success: true, message: "Menu item deleted" });
  });
});

// =============================
// 📅 BOOKINGS ROUTES
// =============================
app.get("/api/bookings", (req, res) => {
  db.query("SELECT * FROM bookings ORDER BY created_at DESC", (err, results) => {
    if (err) return res.status(500).json({ error: "Failed to fetch bookings" });
    res.json(results);
  });
});

app.post("/api/bookings", (req, res) => {
  const { name, email, table_id, date, time } = req.body;
  if (!name || !email || !table_id || !date || !time)
    return res.status(400).json({ error: "All fields are required" });

  const sql =
    "INSERT INTO bookings (name, email, table_id, date, time, status, created_at) VALUES (?, ?, ?, ?, ?, 'Pending', NOW())";
  db.query(sql, [name, email, table_id, date, time], (err, result) => {
    if (err) return res.status(500).json({ error: "Failed to create booking" });

    const booking = {
      id: result.insertId,
      name,
      email,
      table_id,
      date,
      time,
      status: "Pending",
      created_at: new Date(),
    };
    io.emit("newBooking", booking);
    res.json({ success: true, message: "Booking created", booking });
  });
});

app.put("/api/bookings/:id", (req, res) => {
  const { status } = req.body;
  db.query("UPDATE bookings SET status = ? WHERE id = ?", [status, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "Failed to update booking" });
    res.json({ success: true, message: "Booking status updated" });
  });
});

app.delete("/api/bookings/:id", (req, res) => {
  db.query("DELETE FROM bookings WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "Failed to delete booking" });
    res.json({ success: true, message: "Booking deleted" });
  });
});

// =============================
// 📡 SOCKET.IO
// =============================
io.on("connection", (socket) => {
  console.log("🟢 Client connected:", socket.id);
  socket.on("disconnect", () => console.log("🔴 Client disconnected:", socket.id));
});

// =========================
// MENU ROUTES
// =========================
app.get("/api/menu", (req, res) => {
  db.query("SELECT * FROM menu ORDER BY id DESC", (err, results) => {
    if (err) return res.status(500).json({ error: "Failed to fetch menu", details: err.message });
    res.json(results);
  });
});

app.get("/api/menu/:id", (req, res) => {
  const { id } = req.params;
  db.query("SELECT * FROM menu WHERE id = ?", [id], (err, results) => {
    if (err) return res.status(500).json({ error: "Failed to fetch menu item", details: err.message });
    if (!results.length) return res.status(404).json({ error: "Not found" });
    res.json(results[0]);
  });
});

// =========================
// CART & ORDERS
// =========================
app.get("/api/cart/orders/:buyer", (req, res) => {
  const buyer = req.params.buyer;
  const sql = `
    SELECT 
      id,
      buyer_name AS buyerName,
      food_name,
      quantity,
      total,
      status,
      prepStart,
      prepFinish,
      created_at AS createdAt
    FROM orders
    WHERE buyer_name = ?
    ORDER BY id DESC
  `;
  db.query(sql, [buyer], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, orders: rows });
  });
});

// POST confirm cart → pending
app.post("/api/cart/confirm", (req, res) => {
  const { buyerName, items } = req.body;
  if (!items?.length) return res.status(400).json({ success: false, message: "Empty cart" });

  const values = items.map(i => [
    buyerName,
    i.name,
    i.quantity,
    i.price * i.quantity,
    "pending",
    new Date() // must match DATETIME column
  ]);

  const sql = `
    INSERT INTO orders 
      (buyer_name, food_name, quantity, total, status, created_at) 
    VALUES ?
  `;
  db.query(sql, [values], (err, result) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, orderId: result.insertId });
  });
});

// PATCH: Admin updates status + prep times
app.patch("/api/admin/orders/:id/status", (req, res) => {
  const { id } = req.params;
  const { status, prepStart, prepFinish } = req.body;

  if (!["preparing", "finished"].includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid status" });
  }

  let sql, params;
  if (status === "preparing") {
    if (!prepStart || !prepFinish) {
      return res.status(400).json({ success: false, message: "prepStart and prepFinish required" });
    }
    sql = `UPDATE orders SET status=?, prepStart=?, prepFinish=? WHERE id=?`;
    params = [status, prepStart, prepFinish, id];
  } else {
    sql = `UPDATE orders SET status=? WHERE id=?`;
    params = [status, id];
  }

  db.query(sql, params, (err, result) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Order not found" });
    res.json({ success: true, message: `Order ${status}` });
  });
});

// DELETE order
app.delete("/api/admin/orders/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM orders WHERE id=?", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, message: "Deleted" });
  });
});

// =========================
// AUTO DELETE PENDING ORDERS (older than 5 hours)
// =========================
setInterval(() => {
  const sql = `
    DELETE FROM orders 
    WHERE status = 'pending' 
      AND created_at <= DATE_SUB(NOW(), INTERVAL 5 HOUR)
  `;
  db.query(sql, (err, result) => {
    if (err) return console.error("Auto-delete failed:", err.message);
    if (result.affectedRows > 0)
      console.log(`Auto-deleted ${result.affectedRows} pending orders`);
  });
}, 60 * 60 * 1000); // every hour


// =========================
// ADMIN ORDERS ROUTES
// =========================

// GET all orders (with images, prep times, correct status)
app.get("/api/admin/orders", (req, res) => {
  const sql = `
    SELECT 
      o.*,
      m.image AS food_image
    FROM orders o
    LEFT JOIN menu m ON o.food_name = m.name
    ORDER BY o.id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Fetch orders error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch orders" });
    }

    const orders = results.map((o) => ({
      id: o.id,
      buyerName: o.buyer_name || "Guest",
      total: parseFloat(o.total) || 0,
      paymentMethod: o.payment_method || "N/A",
      orderType: o.order_type || "N/A",
      status: o.status || "pending",               // <-- critical
      prepStart: o.prepStart,
      prepFinish: o.prepFinish,
      createdAt: o.created_at,
      items: [
        {
          id: o.id,
          name: o.food_name || "Unknown",
          quantity: parseInt(o.quantity) || 1,
          price: o.quantity ? (parseFloat(o.total) / parseInt(o.quantity)) : 0,
          currency: "RWF",
          image: o.food_image
            ? `http://localhost:5000/${o.food_image}`
            : "/images/default.png",
        },
      ],
    }));

    res.json({ success: true, orders });
  });
});

// PATCH: Update status + prep times
app.patch("/api/admin/orders/:id/status", (req, res) => {
  const { id } = req.params;
  const { status, prepStart, prepFinish } = req.body;

  if (!status || !["preparing", "finished"].includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid status" });
  }

  let updates = { status };
  let values = [status, id];

  if (status === "preparing") {
    if (!prepStart || !prepFinish) {
      return res.status(400).json({ success: false, message: "prepStart and prepFinish required" });
    }
    updates.prepStart = prepStart;
    updates.prepFinish = prepFinish;
    values = [status, prepStart, prepFinish, id];
  }

  const fields = Object.keys(updates)
    .map((k) => `${k}=?`)
    .join(", ");
  const sql = `UPDATE orders SET ${fields} WHERE id=?`;

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Update status error:", err);
      return res.status(500).json({ success: false, message: "Failed to update order", error: err });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    res.json({ success: true, message: `Order ${status === "preparing" ? "preparing" : "finished"}` });
  });
});

// DELETE order
app.delete("/api/admin/orders/:id", (req, res) => {
  const { id } = req.params;

  db.query("DELETE FROM orders WHERE id=?", [id], (err, result) => {
    if (err) {
      console.error("Delete error:", err);
      return res.status(500).json({ success: false, message: "Failed to delete order" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    res.json({ success: true, message: "Order deleted" });
  });
});

// AUTO-DELETE old pending orders (older than 5 hours)
setInterval(() => {
  const sql = `
    DELETE FROM orders 
    WHERE status = 'pending' 
      AND created_at <= DATE_SUB(NOW(), INTERVAL 5 HOUR)
  `;
  db.query(sql, (err, result) => {
    if (err) console.error("Auto-delete failed:", err);
    else if (result.affectedRows > 0)
      console.log(`Auto-deleted ${result.affectedRows} old pending orders`);
  });
}, 60 * 60 * 1000); // every hour

  







// -------------------------
// ORDER NOTIFICATIONS API
// -------------------------

// GET ORDER NOTIFICATIONS (for navbar)
// /api/orders/notifications/:buyer_name
app.get("/api/orders/notifications/:buyer_name", (req, res) => {
  const { buyer_name } = req.params;

  const sql = `
    SELECT id, buyer_name, food_name, quantity, total, status, created_at, is_read
    FROM orders
    WHERE status = 'Pending' AND buyer_name = ?
    ORDER BY created_at DESC
  `;

  db.query(sql, [buyer_name], (err, rows) => {
    if (err) return res.status(500).json({ error: "Database error" });

    const formatted = rows.map(n => ({
      id: n.id,
      type: "order",
      food_name: n.food_name,
      quantity: n.quantity,
      total: n.total,
      status: n.status,
      message: n.status === 'Pending'
        ? `Order for ${n.food_name} is pending. We'll confirm within 5 minutes after payment.`
        : `Order for ${n.food_name} ${n.status}`,
      timestamp: n.created_at,
      read: n.is_read === 1
    }));

    res.json(formatted);
  });
});

// ADD NEW ORDER NOTIFICATION
// /api/orders/notify
app.post("/api/orders/notify", (req, res) => {
  const { buyer_name, food_name, quantity, total, status } = req.body;

  if (!buyer_name || !food_name || !status) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const sql = `
    INSERT INTO orders (buyer_name, food_name, quantity, total, status, created_at, is_read)
    VALUES (?, ?, ?, ?, ?, NOW(), 0)
  `;

  db.query(sql, [buyer_name, food_name, quantity || 1, total || 0, status], (err) => {
    if (err) return res.status(500).json({ error: "Database error" });

    res.json({ message: "Order notification added ✔" });
  });
});

// MARK SINGLE ORDER NOTIFICATION AS READ
// /api/orders/read/:id
app.post("/api/orders/read/:id", (req, res) => {
  const { id } = req.params;

  const sql = `UPDATE orders SET is_read = 1 WHERE id = ?`;

  db.query(sql, [id], (err) => {
    if (err) return res.status(500).json({ error: "Database error" });

    res.json({ message: "Notification marked as read ✔" });
  });
});

// MARK ALL ORDER NOTIFICATIONS AS READ
// /api/orders/read-all/:buyer_name
app.post("/api/orders/read-all/:buyer_name", (req, res) => {
  const { buyer_name } = req.params;

  const sql = `UPDATE orders SET is_read = 1 WHERE buyer_name = ?`;

  db.query(sql, [buyer_name], (err) => {
    if (err) return res.status(500).json({ error: "Database error" });

    res.json({ message: "All order notifications marked as read ✔" });
  });
});



// Latest pending orders for navbar bell icon (kitchen & admin)
ordersRouter.get("/latest-pending", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        id, 
        buyer_name, 
        food_name, 
        quantity, 
        total, 
        created_at,
        is_read
      FROM orders 
      WHERE status = 'pending' OR is_read = 0
      ORDER BY created_at DESC 
      LIMIT 15
    `);

    const count = rows.filter(o => o.is_read == 0).length; // only unread ones

    res.json({
      orders: rows,
      count: count
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch latest orders" });
  }
});

// =============================
// 🚀 START SERVER
// =============================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
