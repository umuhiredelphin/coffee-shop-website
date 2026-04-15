import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
import http from "http";
import { Server } from "socket.io";
import fs from "fs";
import { fileURLToPath } from "url";

dotenv.config();

// Initialize Flutterwave (deprecated - using Pesapal now)
// import Flutterwave from "flutterwave-node-v3";
// const flw = new Flutterwave(process.env.FLW_PUBLIC_KEY, process.env.FLW_SECRET_KEY);

// Initialize Pesapal API 3.0 configuration
import axios from "axios";
import crypto from "crypto";

const PESAPAL_ENV = process.env.PESAPAL_ENVIRONMENT || "sandbox";
const PESAPAL_BASE_URL = PESAPAL_ENV === "sandbox" 
  ? "https://cybqa.pesapal.com/pesapalv3" 
  : "https://pay.pesapal.com/v3";

const pesapalConfig = {
  consumerKey: process.env.PESAPAL_CONSUMER_KEY || "",
  consumerSecret: process.env.PESAPAL_CONSUMER_SECRET || "",
  baseUrl: PESAPAL_BASE_URL
};

// Generate Pesapal OAuth signature
function generateOAuthSignature(method, url, params = {}) {
  const timestamp = new Date().toISOString().replace(/[:-]|[.)\d]/g, "").slice(0, 14);
  const nonce = Math.random().toString(36).substring(2, 15);
  
  const signatureParams = {
    oauth_consumer_key: pesapalConfig.consumerKey,
    oauth_token: "",
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_nonce: nonce,
    oauth_version: "1.0",
    ...params
  };
  
  const sortedParams = Object.keys(signatureParams).sort().map(key => 
    `${encodeURIComponent(key)}=${encodeURIComponent(signatureParams[key])}`
  ).join("&");
  
  const signatureBase = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
  const signatureKey = `${pesapalConfig.consumerSecret}&`;
  const signature = crypto.createHmac("sha1", signatureKey).update(signatureBase).digest("base64");
  
  const authHeader = Object.keys(signatureParams).map(key => 
    `${key}="${encodeURIComponent(signatureParams[key])}"`
  ).join(", ") + `, oauth_signature="${encodeURIComponent(signature)}"`;
  
  return { authHeader, timestamp, nonce };
}

console.log(`Pesapal initialized. Environment: ${PESAPAL_ENV}, Base URL: ${PESAPAL_BASE_URL}`);

// Create __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Get base URL from environment or default
const BASE_URL = process.env.BASE_URL || "http://localhost:5000";
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json({ verify: (req, res, buf) => {
  req.rawBody = buf.toString();
}}));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.raw({ type: 'application/json' }));

// Ensure uploads folder exists
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("uploads/profiles")) fs.mkdirSync("uploads/profiles", { recursive: true });

// Serve static images
app.use("/uploads", express.static("uploads"));

// Multer setup for profile images
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/profiles");
  },
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const profileUpload = multer({ storage: profileStorage });

// Multer setup for menu/table image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// =============================
// 📦 MONGODB CONNECTION
// =============================
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/ffcoffee";

mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ Connected to MongoDB Database"))
  .catch((err) => console.error("❌ MongoDB connection failed:", err.message));

// =============================
// 📦 MONGOOSE SCHEMAS
// =============================

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  password: { type: String, required: true },
  profileImage: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

// Admin Schema
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  resetCode: { type: String },
  resetExpiry: { type: Number },
  createdAt: { type: Date, default: Date.now }
});

const Admin = mongoose.model("Admin", adminSchema);

// Menu Schema
const menuSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  currency: { type: String, default: "RWF" },
  description: { type: String },
  image: { type: String },
  category: { type: String, default: "coffee" },
  type: { type: String, default: "food" },
  categories: { type: [String], default: ["breakfast"] },
  rating: { type: Number, default: 0.0 },
  isPopular: { type: Boolean, default: false },
  isNew: { type: Boolean, default: false },
  availabilityTime: { type: String, default: "15" },
  createdAt: { type: Date, default: Date.now }
});

const Menu = mongoose.model("Menu", menuSchema);

// Table Schema
const tableSchema = new mongoose.Schema({
  tableNumber: { type: String, required: true, unique: true },
  tableImage: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Table = mongoose.model("Table", tableSchema);

// Booking Schema
const bookingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, default: "" },
  tableId: { type: String, required: true },
  numPeople: { type: Number, default: 1 },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  status: { type: String, default: "Pending" },
  orderFood: { type: Boolean, default: false },
  foods: { type: Array, default: [] },
  createdAt: { type: Date, default: Date.now }
});

const Booking = mongoose.model("Booking", bookingSchema);

// Order Schema
const orderSchema = new mongoose.Schema({
  buyerName: { type: String, required: true },
  foodName: { type: String, required: true },
  quantity: { type: Number, required: true },
  total: { type: Number, required: true },
  status: { type: String, default: "pending" },
  paymentStatus: { type: String, enum: ["pending", "paid"], default: "pending" },
  orderStatus: { type: String, enum: ["pending", "preparing", "finished"], default: "pending" },
  paymentMethod: { type: String, default: "Cash" },
  orderType: { type: String, default: "dine-in" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  prepStart: { type: Date },
  prepFinish: { type: Date },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model("Order", orderSchema);

// Payment Schema
const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  orderId: { type: mongoose.Schema.Types.ObjectId, required: true },
  tx_ref: { type: String, required: true, unique: true },
  order_request_id: { type: String }, // Pesapal order request ID
  transaction_id: { type: String },
  amount: { type: Number, required: true },
  currency: { type: String, default: "RWF" },
  paymentMethod: { type: String, default: "Pesapal" },
  status: { type: String, enum: ["pending", "completed", "failed", "invalid"], default: "pending" },
  payment_response: { type: Object, default: {} },
  ipn_response: { type: Object, default: {} },
  verifiedAt: { type: Date },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Payment = mongoose.model("Payment", paymentSchema);

// Stock History Schema
const stockHistorySchema = new mongoose.Schema({
  menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: "Menu", required: true },
  menuItemName: { type: String, required: true },
  type: { type: String, enum: ["stock_in", "stock_out"], required: true },
  quantity: { type: Number, required: true },
  previousStock: { type: Number, required: true },
  newStock: { type: Number, required: true },
  supplier: { type: String, default: "" },
  reason: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});

const StockHistory = mongoose.model("StockHistory", stockHistorySchema);

// Stock Item Schema (Separate inventory items for stock management)
const stockItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, default: "ingredients" },
  unit: { type: String, default: "pcs" },
  currentStock: { type: Number, default: 0 },
  minStock: { type: Number, default: 10 },
  price: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const StockItem = mongoose.model("StockItem", stockItemSchema);

// Email setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Helper: generate 6-digit reset code
function generateResetCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Middleware to check database connection
const checkDbConnection = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ 
      success: false, 
      message: "Database connection not available. Please try again later." 
    });
  }
  next();
};

// =============================
// 👤 USER AUTH ROUTES
// =============================

// User Signup
app.post("/api/signup", checkDbConnection, async (req, res) => {
  try {
    const { username, email, phone, password, confirmPassword } = req.body;
    if (!username || !email || !phone || !password || !confirmPassword)
      return res.status(400).json({ message: "All fields are required." });
    if (password !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match." });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already exists." });

    const hashed = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, phone, password: hashed });
    await newUser.save();

    res.status(201).json({ message: "Account created successfully!" });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// User Login
app.post("/api/login", checkDbConnection, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password required." });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Invalid email or password." });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ message: "Invalid email or password." });

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage,
        role: "user"
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Database error" });
  }
});

// Get All Users (For Admin)
app.get("/api/users", checkDbConnection, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });

    const usersWithImages = users.map(user => ({
      id: user._id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role || "user",
      profileImage: user.profileImage
        ? `${BASE_URL}/uploads/profiles/${path.basename(user.profileImage)}`
        : null,
      createdAt: user.createdAt
    }));

    res.json({ success: true, users: usersWithImages });
  } catch (err) {
    console.error("Failed to fetch users:", err);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
});

// Get single user by ID (For Admin)
app.get("/api/users/:id", checkDbConnection, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    res.json({ 
      success: true, 
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        role: user.role || "user",
        profileImage: user.profileImage
          ? `${BASE_URL}/uploads/profiles/${path.basename(user.profileImage)}`
          : null,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    console.error("Failed to fetch user:", err);
    res.status(500).json({ success: false, message: "Failed to fetch user" });
  }
});

// Update user (For Admin)
app.put("/api/users/:id", checkDbConnection, async (req, res) => {
  try {
    const { username, email, phone, role } = req.body;
    
    // Check if user exists
    const existingUser = await User.findById(req.params.id);
    if (!existingUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    // Check if email is being changed and if it's already in use
    if (email && email !== existingUser.email) {
      const emailExists = await User.findOne({ email, _id: { $ne: req.params.id } });
      if (emailExists) {
        return res.status(400).json({ success: false, message: "Email already in use" });
      }
    }
    
    // Check if username is being changed and if it's already in use
    if (username && username !== existingUser.username) {
      const usernameExists = await User.findOne({ username, _id: { $ne: req.params.id } });
      if (usernameExists) {
        return res.status(400).json({ success: false, message: "Username already in use" });
      }
    }
    
    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { 
        username: username || existingUser.username,
        email: email || existingUser.email,
        phone: phone || existingUser.phone,
        role: role || existingUser.role || "user"
      },
      { new: true }
    );
    
    res.json({ 
      success: true, 
      message: "User updated successfully",
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role || "user"
      }
    });
  } catch (err) {
    console.error("Failed to update user:", err);
    res.status(500).json({ success: false, message: "Failed to update user: " + err.message });
  }
});

// Delete user (For Admin)
app.delete("/api/users/:id", checkDbConnection, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    // Prevent deleting the last admin
    if (user.role === "admin") {
      const adminCount = await User.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res.status(400).json({ success: false, message: "Cannot delete the last admin" });
      }
    }
    
    await User.findByIdAndDelete(req.params.id);
    
    res.json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    console.error("Failed to delete user:", err);
    res.status(500).json({ success: false, message: "Failed to delete user" });
  }
});

// Forgot Password (User)
app.post("/api/forgot-password", checkDbConnection, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Email not found." });

    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "15m" });
    const resetLink = `${CLIENT_URL}/reset-password/${token}`;

    await transporter.sendMail({
      from: `"F&F Coffee" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Password Reset Request",
      html: `<h3>Password Reset</h3>
             <p>Click below to reset your password (valid 15 mins):</p>
             <a href="${resetLink}">${resetLink}</a>`,
    });

    res.json({ message: "Password reset link sent to your email." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Failed to send email" });
  }
});

// Reset Password (User)
app.post("/api/reset-password/:token", checkDbConnection, async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ message: "Password required" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const hashed = await bcrypt.hash(newPassword, 10);
    await User.findOneAndUpdate({ email: decoded.email }, { password: hashed });

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    res.status(400).json({ message: "Invalid or expired token" });
  }
});

// =============================
// 👑 ADMIN AUTH ROUTES
// =============================

// Admin Register
app.post("/api/admin/register", checkDbConnection, async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ success: false, message: "All fields required" });

    const existing = await Admin.findOne({ email });
    if (existing)
      return res.status(400).json({ success: false, message: "Email already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const newAdmin = new Admin({ username, email, password: hashed });
    await newAdmin.save();

    res.json({ success: true, message: "Admin registered successfully" });
  } catch (err) {
    console.error("Admin register error:", err);
    res.status(500).json({ success: false, message: "Database error" });
  }
});

// Admin Login
app.post("/api/admin/login", checkDbConnection, async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin)
      return res.status(400).json({ success: false, message: "Invalid credentials" });

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid)
      return res.status(400).json({ success: false, message: "Invalid credentials" });

    const token = jwt.sign(
      { id: admin._id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      admin: { id: admin._id, username: admin.username, email: admin.email },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({ success: false, message: "Database error" });
  }
});

// Admin Forgot Password (6-digit code)
app.post("/api/admin/forgot", checkDbConnection, async (req, res) => {
  try {
    const { email } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin)
      return res.status(400).json({ success: false, message: "Email not found" });

    const code = generateResetCode();
    const expiry = Date.now() + 10 * 60 * 1000;
    
    admin.resetCode = code;
    admin.resetExpiry = expiry;
    await admin.save();

    await transporter.sendMail({
      from: `"F&F Coffee Admin" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your Password Reset Code",
      html: `<h3>Your Reset Code</h3><h2>${code}</h2><p>Expires in 10 minutes.</p>`,
    });

    res.json({ success: true, message: "Reset code sent to your email" });
  } catch (err) {
    console.error("Admin forgot error:", err);
    res.status(500).json({ success: false, message: "Database error" });
  }
});

// Verify Reset Code
app.post("/api/admin/reset/verify", checkDbConnection, async (req, res) => {
  try {
    const { email, code } = req.body;
    const admin = await Admin.findOne({ email, resetCode: code });
    if (!admin)
      return res.status(400).json({ success: false, message: "Invalid reset code" });

    if (Date.now() > admin.resetExpiry)
      return res.status(400).json({ success: false, message: "Code expired" });

    res.json({ success: true, message: "Code verified" });
  } catch (err) {
    console.error("Verify code error:", err);
    res.status(500).json({ success: false, message: "Database error" });
  }
});

// Reset Admin Password
app.post("/api/admin/reset", checkDbConnection, async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const admin = await Admin.findOne({ email, resetCode: code });
    if (!admin)
      return res.status(400).json({ success: false, message: "Invalid reset code" });

    if (Date.now() > admin.resetExpiry)
      return res.status(400).json({ success: false, message: "Code expired" });

    const hashed = await bcrypt.hash(newPassword, 10);
    admin.password = hashed;
    admin.resetCode = null;
    admin.resetExpiry = null;
    await admin.save();

    res.json({ success: true, message: "Password reset successfully" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ success: false, message: "Database error" });
  }
});

// =============================
// 🪑 TABLES MANAGEMENT ROUTES
// =============================

// Get all tables with full image URLs
app.get("/api/tables", checkDbConnection, async (req, res) => {
  try {
    const tables = await Table.find().sort({ createdAt: -1 });

    const tablesWithFullImageUrl = tables.map(table => ({
      id: table._id,
      table_number: table.tableNumber,
      table_image: `${BASE_URL}${table.tableImage}`,
      created_at: table.createdAt
    }));

    res.json(tablesWithFullImageUrl);
  } catch (err) {
    console.error("Failed to fetch tables:", err);
    res.status(500).json({ success: false, message: "Failed to fetch tables" });
  }
});

// Add a new table
app.post("/api/tables", checkDbConnection, upload.single("tableImage"), async (req, res) => {
  try {
    const { tableNumber } = req.body;
    if (!tableNumber || !req.file) {
      return res.status(400).json({ success: false, message: "Table number and image are required." });
    }
    
    const imagePath = `/uploads/${req.file.filename}`;
    const newTable = new Table({ tableNumber, tableImage: imagePath });
    await newTable.save();

    res.status(201).json({ 
      success: true, 
      message: "Table added successfully!", 
      table: { id: newTable._id, tableNumber, tableImage: imagePath } 
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: "Table number already exists." });
    }
    console.error("Failed to add table:", err);
    res.status(500).json({ success: false, message: "Failed to add table." });
  }
});

// Edit an existing table
app.put("/api/tables/:id", checkDbConnection, upload.single("tableImage"), async (req, res) => {
  try {
    const { id } = req.params;
    const { tableNumber } = req.body;

    if (!tableNumber) {
      return res.status(400).json({ success: false, message: "Table number is required." });
    }

    const updateData = { tableNumber };
    if (req.file) {
      updateData.tableImage = `/uploads/${req.file.filename}`;
    }

    const updatedTable = await Table.findByIdAndUpdate(id, updateData, { new: true });
    
    if (!updatedTable) {
      return res.status(404).json({ success: false, message: "Table not found." });
    }

    res.json({ success: true, message: "Table updated successfully!" });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: "Table number already exists." });
    }
    console.error("Failed to update table:", err);
    res.status(500).json({ success: false, message: "Failed to update table." });
  }
});

// DELETE TABLE
app.delete("/api/tables/:id", checkDbConnection, async (req, res) => {
  try {
    const { id } = req.params;
    const table = await Table.findById(id);
    
    if (!table) {
      return res.status(404).json({ success: false, message: "Table not found." });
    }

    // Delete image file
    if (table.tableImage) {
      const filePath = path.join(__dirname, "uploads", path.basename(table.tableImage));
      fs.unlink(filePath, (fsErr) => {
        if (fsErr) console.error("Failed to delete image:", fsErr);
        else console.log("Image deleted:", filePath);
      });
    }

    await Table.findByIdAndDelete(id);
    res.json({ success: true, message: "Table deleted successfully!" });
  } catch (err) {
    console.error("Error deleting table:", err);
    res.status(500).json({ success: false, message: "Database delete error." });
  }
});

// =============================
// ☕ MENU ROUTES
// =============================
app.get("/api/menu", checkDbConnection, async (req, res) => {
  try {
    const menuItems = await Menu.find().sort({ createdAt: -1 });
    res.json(menuItems);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch menu" });
  }
});

app.post("/api/menu", checkDbConnection, upload.single("image"), async (req, res) => {
  try {
    console.log("Received menu request:", req.body);
    const { name, price, currency, description, category, type, categories, availabilityTime } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : "";
    
    if (!name || !price || !currency) {
      console.log("Missing required fields:", { name, price, currency });
      return res.status(400).json({ error: "Missing fields" });
    }

    // Parse categories from JSON string if it's a string
    let parsedCategories = categories;
    if (typeof categories === 'string') {
      try {
        parsedCategories = JSON.parse(categories);
      } catch (e) {
        console.log("Failed to parse categories:", categories);
        parsedCategories = [categories];
      }
    } else if (!categories) {
      parsedCategories = ["breakfast"];
    }

    console.log("Creating menu item with:", { 
      name, 
      price, 
      currency, 
      description, 
      image, 
      category: category || "coffee",
      type: type || "food",
      categories: parsedCategories,
      availabilityTime: availabilityTime || "15"
    });

    const newMenuItem = new Menu({ 
      name, 
      price: Number(price), 
      currency, 
      description, 
      image, 
      category: category || "coffee",
      type: type || "food",
      categories: parsedCategories || ["breakfast"],
      availabilityTime: availabilityTime || "15"
    });
    await newMenuItem.save();

    res.json({ success: true, message: "Menu item added", id: newMenuItem._id });
  } catch (err) {
    console.error("Error adding menu item:", err);
    res.status(500).json({ error: "Failed to add menu item: " + err.message });
  }
});

app.delete("/api/menu/:id", checkDbConnection, async (req, res) => {
  try {
    await Menu.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Menu item deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete menu item" });
  }
});

// PUT - Update menu item
app.put("/api/menu/:id", checkDbConnection, upload.single("image"), async (req, res) => {
  try {
    const menuId = req.params.id;
    console.log("Received update request for ID:", menuId);
    console.log("Update body:", req.body);
    
    // Validate MongoDB ObjectId
    if (!menuId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log("Invalid ID format:", menuId);
      return res.status(400).json({ error: "Invalid menu item ID format" });
    }
    
    const { name, price, currency, description, category, type, categories, availabilityTime } = req.body;
    
    // Validate required fields
    if (!name || !price || !currency) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    // Parse categories from JSON string if it's a string
    let parsedCategories = categories;
    if (typeof categories === 'string') {
      try {
        parsedCategories = JSON.parse(categories);
        console.log("Parsed categories:", parsedCategories);
      } catch (e) {
        console.log("Failed to parse categories, using as single value:", categories);
        parsedCategories = [categories];
      }
    }

    const updateData = {
      name,
      price: Number(price),
      currency,
      description,
      category: category || "coffee",
      type: type || "food",
      categories: parsedCategories || ["breakfast"],
      availabilityTime: availabilityTime || "15"
    };

    // Only update image if a new one is uploaded
    if (req.file) {
      updateData.image = `/uploads/${req.file.filename}`;
      console.log("New image uploaded:", updateData.image);
    }

    const updatedItem = await Menu.findByIdAndUpdate(
      menuId,
      updateData,
      { new: true }
    );

    if (!updatedItem) {
      console.log("Menu item not found for ID:", menuId);
      return res.status(404).json({ error: "Menu item not found" });
    }

    console.log("Successfully updated menu item:", updatedItem);
    res.json({ success: true, message: "Menu item updated", menu: updatedItem });
  } catch (err) {
    console.error("Error updating menu item:", err);
    res.status(500).json({ error: "Failed to update menu item: " + err.message });
  }
});

// =============================
// 📦 STOCK ITEMS MANAGEMENT (Separate from Menu)
// =============================

// Get all stock items
app.get("/api/stock/items", checkDbConnection, async (req, res) => {
  try {
    const stockItems = await StockItem.find().sort({ createdAt: -1 });
    res.json({ success: true, items: stockItems });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stock items" });
  }
});

// Create stock item
app.post("/api/stock/items", checkDbConnection, async (req, res) => {
  try {
    const { name, category, unit, currentStock, minStock, price } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: "Item name is required" });
    }

    const newItem = new StockItem({
      name,
      category: category || "ingredients",
      unit: unit || "pcs",
      currentStock: currentStock || 0,
      minStock: minStock || 10,
      price: price || 0
    });

    await newItem.save();
    res.json({ success: true, item: newItem });
  } catch (err) {
    res.status(500).json({ error: "Failed to create stock item" });
  }
});

// Update stock item
app.put("/api/stock/items/:id", checkDbConnection, async (req, res) => {
  try {
    const { name, category, unit, currentStock, minStock, price } = req.body;
    
    const updatedItem = await StockItem.findByIdAndUpdate(
      req.params.id,
      { name, category, unit, currentStock, minStock, price },
      { new: true }
    );

    if (!updatedItem) {
      return res.status(404).json({ error: "Stock item not found" });
    }

    res.json({ success: true, item: updatedItem });
  } catch (err) {
    res.status(500).json({ error: "Failed to update stock item" });
  }
});

// Delete stock item
app.delete("/api/stock/items/:id", checkDbConnection, async (req, res) => {
  try {
    await StockItem.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Stock item deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete stock item" });
  }
});

// =============================
// 📦 STOCK MANAGEMENT ROUTES
// =============================

// GET - Get stock history for a menu item
app.get("/api/stock/history/:menuItemId", checkDbConnection, async (req, res) => {
  try {
    const { menuItemId } = req.params;
    const history = await StockHistory.find({ menuItemId }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stock history" });
  }
});

// GET - Get all stock history
app.get("/api/stock/history", checkDbConnection, async (req, res) => {
  try {
    const history = await StockHistory.find().sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stock history" });
  }
});

// POST - Add stock (stock in)
app.post("/api/stock/in", checkDbConnection, async (req, res) => {
  try {
    const { menuItemId, stockItemId, quantity, supplier, reason } = req.body;
    
    const itemId = stockItemId || menuItemId;
    if (!itemId || !quantity || quantity <= 0) {
      return res.status(400).json({ error: "Item and valid quantity are required" });
    }

    // Try StockItem first, then Menu
    let item = await StockItem.findById(itemId);
    let isStockItem = true;
    
    if (!item) {
      item = await Menu.findById(itemId);
      isStockItem = false;
    }

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    const previousStock = item.currentStock || item.stock || 0;
    const newStock = previousStock + Number(quantity);
    
    if (isStockItem) {
      item.currentStock = newStock;
      item.updatedAt = new Date();
    } else {
      item.stock = newStock;
    }
    await item.save();

    // Create stock history record
    const stockHistory = new StockHistory({
      menuItemId: item._id,
      menuItemName: item.name,
      type: "stock_in",
      quantity: Number(quantity),
      previousStock,
      newStock,
      supplier: supplier || "",
      reason: reason || "Stock In"
    });
    await stockHistory.save();

    res.json({ 
      success: true, 
      message: "Stock added successfully",
      stock: newStock,
      history: stockHistory
    });
  } catch (err) {
    console.error("Error adding stock:", err);
    res.status(500).json({ error: "Failed to add stock: " + err.message });
  }
});

// POST - Remove stock (stock out)
app.post("/api/stock/out", checkDbConnection, async (req, res) => {
  try {
    const { menuItemId, stockItemId, quantity, reason } = req.body;
    
    const itemId = stockItemId || menuItemId;
    if (!itemId || !quantity || quantity <= 0) {
      return res.status(400).json({ error: "Item and valid quantity are required" });
    }

    // Try StockItem first, then Menu
    let item = await StockItem.findById(itemId);
    let isStockItem = true;
    
    if (!item) {
      item = await Menu.findById(itemId);
      isStockItem = false;
    }

    if (!item) {
      return res.status(404).json({ error: "Item not found" });
    }

    const previousStock = item.currentStock || item.stock || 0;
    const newStock = Math.max(0, previousStock - Number(quantity));
    
    if (isStockItem) {
      item.currentStock = newStock;
      item.updatedAt = new Date();
    } else {
      item.stock = newStock;
    }
    await item.save();

    // Create stock history record
    const stockHistory = new StockHistory({
      menuItemId: item._id,
      menuItemName: item.name,
      type: "stock_out",
      quantity: Number(quantity),
      previousStock,
      newStock,
      reason: reason || "Stock Out"
    });
    await stockHistory.save();

    res.json({ 
      success: true, 
      message: "Stock removed successfully",
      stock: newStock,
      history: stockHistory
    });
  } catch (err) {
    console.error("Error removing stock:", err);
    res.status(500).json({ error: "Failed to remove stock: " + err.message });
  }
});

// =============================
// 📅 BOOKINGS ROUTES
// =============================
app.get("/api/bookings", checkDbConnection, async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });
    // Transform booking data to include frontend-expected field names
    const transformedBookings = bookings.map(booking => ({
      ...booking.toObject(),
      id: booking._id,
      table_number: booking.tableId,
      num_people: booking.numPeople,
      foods: booking.foods || []
    }));
    res.json(transformedBookings);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

app.post("/api/bookings", checkDbConnection, async (req, res) => {
  try {
    // Support both old format (name, email, table_id, date, time) and new format (with phone, num_people, order_food, foods)
    const { name, email, table_id, date, time, phone, num_people, order_food, foods } = req.body;
    
    if (!name || !email || !table_id) {
      return res.status(400).json({ error: "Name, email, and table_id are required" });
    }

    // If old format with date and time, use them; otherwise use current date/time
    const bookingDate = date ? new Date(date) : new Date();
    const bookingTime = time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const newBooking = new Booking({
      name,
      email,
      tableId: table_id,
      date: bookingDate,
      time: bookingTime,
      status: "Pending",
      // New fields for extended booking
      phone: phone || "",
      numPeople: num_people || 1,
      orderFood: order_food === "Yes",
      foods: foods || []
    });
    await newBooking.save();

    const booking = {
      id: newBooking._id,
      name,
      email,
      table_id,
      date: bookingDate,
      time: bookingTime,
      status: "Pending",
      phone: phone || "",
      numPeople: num_people || 1,
      orderFood: order_food === "Yes",
      foods: foods || [],
      created_at: newBooking.createdAt,
    };
    io.emit("newBooking", booking);
    res.json({ success: true, message: "Booking created", booking });
  } catch (err) {
    console.error("Booking error:", err);
    res.status(500).json({ error: "Failed to create booking" });
  }
});

app.put("/api/bookings/:id", checkDbConnection, async (req, res) => {
  try {
    const { status } = req.body;
    await Booking.findByIdAndUpdate(req.params.id, { status });
    res.json({ success: true, message: "Booking status updated" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update booking" });
  }
});

app.delete("/api/bookings/:id", checkDbConnection, async (req, res) => {
  try {
    await Booking.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Booking deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete booking" });
  }
});

// =============================
// 📡 SOCKET.IO
// =============================
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("disconnect", () => console.log("Client disconnected:", socket.id));
});

// =========================
// CART & ORDERS
// =========================
app.get("/api/cart/orders/:buyer", checkDbConnection, async (req, res) => {
  try {
    const buyer = req.params.buyer;
    const orders = await Order.find({ buyerName: buyer }).sort({ createdAt: -1 });
    
    const formattedOrders = orders.map(o => ({
      id: o._id,
      buyerName: o.buyerName,
      food_name: o.foodName,
      quantity: o.quantity,
      total: o.total,
      status: o.status,
      paymentMethod: o.paymentMethod,
      orderType: o.orderType,
      prepStart: o.prepStart,
      prepFinish: o.prepFinish,
      createdAt: o.createdAt
    }));

    res.json({ success: true, orders: formattedOrders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST confirm cart → pending
app.post("/api/cart/confirm", checkDbConnection, async (req, res) => {
  try {
    const { buyerName, items, paymentMethod, orderType } = req.body;
    if (!items?.length) return res.status(400).json({ success: false, message: "Empty cart" });

    const user = await User.findOne({ username: buyerName });
    const userId = user ? user._id : null;

    // Process orders and deduct stock
    const orderPromises = items.map(async (item) => {
      // Find the menu item to get current stock
      const menuItem = await Menu.findOne({ name: item.name });
      const previousStock = menuItem ? (menuItem.stock || 0) : 0;
      const newStock = Math.max(0, previousStock - item.quantity);

      // Update stock in menu item
      if (menuItem) {
        menuItem.stock = newStock;
        await menuItem.save();

        // Create stock history record for stock out
        const stockHistory = new StockHistory({
          menuItemId: menuItem._id,
          menuItemName: menuItem.name,
          type: "stock_out",
          quantity: item.quantity,
          previousStock,
          newStock,
          reason: `Order - ${buyerName}`
        });
        await stockHistory.save();
      }

      const newOrder = new Order({
        buyerName,
        foodName: item.name,
        quantity: item.quantity,
        total: item.price * item.quantity,
        status: "pending",
        paymentMethod: paymentMethod || "Cash",
        orderType: orderType || "dine-in"
      });
      return newOrder.save();
    });

    const savedOrders = await Promise.all(orderPromises);
    const orderId = savedOrders[0]._id;

    if (userId) {
      const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const txRef = `FFCO-${orderId}-${Date.now()}`;
      const newPayment = new Payment({
        userId,
        orderId,
        tx_ref: txRef,
        amount: totalAmount,
        paymentMethod: paymentMethod || 'Cash',
        status: 'paid',
        description: `Payment for order #${orderId}`
      });
      await newPayment.save();
    }

    res.json({ success: true, orderId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH: Admin updates status + prep times
app.patch("/api/admin/orders/:id/status", checkDbConnection, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, prepStart, prepFinish } = req.body;

    if (!["preparing", "finished"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const updateData = { status };
    if (status === "preparing") {
      if (!prepStart || !prepFinish) {
        return res.status(400).json({ success: false, message: "prepStart and prepFinish required" });
      }
      updateData.prepStart = prepStart;
      updateData.prepFinish = prepFinish;
    }

    const updatedOrder = await Order.findByIdAndUpdate(id, updateData, { new: true });
    if (!updatedOrder) return res.status(404).json({ success: false, message: "Order not found" });
    
    res.json({ success: true, message: `Order ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE order
app.delete("/api/admin/orders/:id", checkDbConnection, async (req, res) => {
  try {
    const { id } = req.params;
    const deletedOrder = await Order.findByIdAndDelete(id);
    if (!deletedOrder) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// AUTO DELETE PENDING ORDERS (older than 5 hours)
setInterval(async () => {
  try {
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const result = await Order.deleteMany({
      status: 'pending',
      createdAt: { $lte: fiveHoursAgo }
    });
    if (result.deletedCount > 0)
      console.log(`Auto-deleted ${result.deletedCount} pending orders`);
  } catch (err) {
    console.error("Auto-delete failed:", err.message);
  }
}, 60 * 60 * 1000); // every hour

// =========================
// ADMIN ORDERS ROUTES
// =========================
app.get("/api/admin/orders", checkDbConnection, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    
    const formattedOrders = await Promise.all(orders.map(async (o) => {
      const menuItem = await Menu.findOne({ name: o.foodName });
      return {
        id: o._id,
        buyerName: o.buyerName || "Guest",
        total: o.total || 0,
        paymentMethod: o.paymentMethod || "Cash",
        orderType: o.orderType || "dine-in",
        status: o.status || "pending",
        prepStart: o.prepStart,
        prepFinish: o.prepFinish,
        createdAt: o.createdAt,
        items: [
          {
            id: o._id,
            name: o.foodName || "Unknown",
            quantity: o.quantity || 1,
            price: o.quantity ? (o.total / o.quantity) : 0,
            currency: "RWF",
            image: menuItem?.image
              ? `${BASE_URL}${menuItem.image}`
              : "/images/default.png",
          },
        ],
      };
    }));

    res.json({ success: true, orders: formattedOrders });
  } catch (err) {
    console.error("Fetch orders error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
});

// ORDER NOTIFICATIONS API
app.get("/api/orders/notifications/:buyer_name", checkDbConnection, async (req, res) => {
  try {
    const { buyer_name } = req.params;
    const orders = await Order.find({ buyerName: buyer_name, status: 'pending' }).sort({ createdAt: -1 });
    
    const formatted = orders.map(n => ({
      id: n._id,
      type: "order",
      food_name: n.foodName,
      quantity: n.quantity,
      total: n.total,
      status: n.status,
      message: n.status === 'pending' ? `Order for ${n.foodName} is pending.` : `Order for ${n.foodName} ${n.status}`,
      timestamp: n.createdAt,
      read: n.isRead
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
  }
});

// =============================
// 👤 USER PROFILE & PAYMENT ROUTES
// =============================

// Fetch user profile by ID
app.get("/api/users/profile/:id", checkDbConnection, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, user });
  } catch (err) {
    console.error("Failed to fetch user profile:", err);
    res.status(500).json({ success: false, message: "Database error" });
  }
});

// Fetch user by email
app.get("/api/users/by-email/:email", checkDbConnection, async (req, res) => {
  try {
    const email = req.params.email;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, user });
  } catch (err) {
    console.error("Failed to fetch user by email:", err);
    res.status(500).json({ success: false, message: "Database error" });
  }
});

// Fetch payment history for a user
app.get("/api/payments/history/:userId", checkDbConnection, async (req, res) => {
  try {
    const userId = req.params.userId;
    const payments = await Payment.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, payments });
  } catch (err) {
    console.error("Failed to fetch payment history:", err);
    res.status(500).json({ success: false, message: "Database error" });
  }
});

// Flutterwave Payment Routes

// Direct payment for orders (without Flutterwave)
app.post("/api/orders/:id/pay", checkDbConnection, async (req, res) => {
  try {
    const orderId = req.params.id;
    const { amount, method } = req.body;
    
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }
    
    // Update order payment status
    order.paymentMethod = method || "MoMo";
    order.status = "paid";
    order.total = amount || order.total;
    await order.save();
    
    // Create or update payment record
    const payment = await Payment.findOne({ orderId: orderId });
    if (payment) {
      payment.status = "paid";
      payment.paymentMethod = method || "MoMo";
      payment.amount = amount || order.total;
      await payment.save();
    } else {
      await Payment.create({
        userId: order.userId,
        orderId: orderId,
        amount: amount || order.total,
        currency: "RWF",
        paymentMethod: method || "MoMo",
        status: "paid"
      });
    }
    
    res.json({ success: true, message: "Payment successful", order });
  } catch (err) {
    console.error("Payment error:", err);
    res.status(500).json({ success: false, message: "Payment failed" });
  }
});

// ============================================
// PESAPAL API 3.0 PAYMENT ENDPOINTS
// ============================================

// Initialize payment with Pesapal
app.post("/api/pesapal/initiate", async (req, res) => {
  try {
    const { orderId, amount, email, phone, name } = req.body;
    
    if (!orderId || !amount) {
      return res.status(400).json({ success: false, message: "Order ID and amount required" });
    }

    // Check if Pesapal credentials are configured
    if (!pesapalConfig.consumerKey || !pesapalConfig.consumerSecret) {
      return res.status(500).json({ success: false, message: "Pesapal not configured. Please add API credentials to .env" });
    }

    const txRef = `FFCO-${orderId}-${Date.now()}`;
    const callbackUrl = `${CLIENT_URL}/payment`;
    const ipnUrl = `${BASE_URL}/api/pesapal/ipn`;
    
    // Pesapal order request payload
    const orderRequest = {
      id: txRef,
      currency: "RWF",
      amount: parseFloat(amount).toFixed(2),
      description: `Payment for Order #${orderId}`,
      callback_url: callbackUrl,
      notification_id: "", // Will be set if you have IPN configured
      billing_order: {
        email: email || "customer@example.com",
        phone_number: phone || "250796403913",
        country_code: "RW",
        first_name: name?.split(" ")[0] || name || "Customer",
        last_name: name?.split(" ")[1] || "",
        line_items: [
          {
            name: `Coffee Order #${orderId}`,
            quantity: 1,
            unit_price: parseFloat(amount).toFixed(2),
            total: parseFloat(amount).toFixed(2)
          }
        ]
      }
    };

    console.log("Pesapal order request:", JSON.stringify(orderRequest, null, 2));
    
    // Generate OAuth signature
    const url = `${pesapalConfig.baseUrl}/api/Orders/SubmitOrderRequest`;
    const { authHeader, timestamp, nonce } = generateOAuthSignature("POST", url);
    
    const response = await axios.post(url, orderRequest, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": authHeader,
        "Timestamp": timestamp,
        "Nonce": nonce
      }
    });
    
    const responseData = response.data;
    console.log("Pesapal response:", JSON.stringify(responseData, null, 2));
    
    // Create payment record in MongoDB
    const userId = req.body.userId;
    try {
      await Payment.create({
        userId: userId || null,
        orderId: orderId,
        tx_ref: txRef,
        order_request_id: responseData.order_request_id || responseData.orderRequestId || "",
        amount: parseFloat(amount),
        currency: "RWF",
        paymentMethod: "Pesapal",
        status: "pending",
        payment_response: responseData,
        description: `Payment for order #${orderId}`
      });
      console.log(`Payment record created for order ${orderId} with tx_ref: ${txRef}`);
    } catch (dbError) {
      console.error("Error creating payment record:", dbError);
    }
    
    // Return the iframe URL for payment
    const redirectUrl = responseData.redirect_url || responseData.url || `${CLIENT_URL}/payment?orderId=${orderId}&txRef=${txRef}`;
    
    res.json({
      success: true,
      redirect_url: redirectUrl,
      order_request_id: responseData.order_request_id || responseData.orderRequestId,
      txRef: txRef,
    });
  } catch (error) {
    console.error("Pesapal initiate error:", error.response?.data || error.message);
    res.status(500).json({ success: false, message: error.response?.data?.error?.message || error.message || "Payment initiation failed" });
  }
});

// Verify Flutterwave payment
app.post("/api/flutterwave/verify", async (req, res) => {
  try {
    const { transactionId, orderId, expectedAmount } = req.body;
    
    if (!transactionId) {
      return res.status(400).json({ success: false, message: "Transaction ID required" });
    }
    
    // Check for duplicate verification
    const existingPayment = await Payment.findOne({ transaction_id: transactionId, status: "successful" });
    if (existingPayment) {
      return res.status(400).json({ success: false, message: "Payment already verified", verified: true });
    }

    const response = await flw.Transaction.verify({ id: transactionId });
    const paymentData = response.data;
    
    // Validate payment status
    if (paymentData.status !== "successful" && paymentData.status !== "success") {
      return res.json({ success: true, verified: false, message: "Payment not successful" });
    }
    
    // Validate currency is RWF
    if (paymentData.currency?.toUpperCase() !== "RWF") {
      return res.status(400).json({ success: false, message: "Invalid currency. Expected RWF" });
    }
    
    // Validate amount matches expected amount (if provided)
    if (expectedAmount && parseFloat(paymentData.amount) !== parseFloat(expectedAmount)) {
      return res.status(400).json({ success: false, message: "Amount mismatch" });
    }
    
    // Get order ID from payment record or request
    const paymentRecord = await Payment.findOne({ transaction_id: transactionId });
    const finalOrderId = orderId || paymentRecord?.orderId;
    
    // Update order payment status
    if (finalOrderId) {
      await Order.findByIdAndUpdate(finalOrderId, { 
        paymentMethod: "Flutterwave",
        paymentStatus: "paid",
        status: "paid",
        orderStatus: "preparing"
      });
    }
    
    // Update payment record with verification details
    if (paymentRecord) {
      await Payment.findByIdAndUpdate(paymentRecord._id, {
        status: "successful",
        paymentMethod: "Flutterwave",
        transaction_id: transactionId,
        flutterwave_response: paymentData,
        verifiedAt: new Date(),
        updatedAt: new Date()
      });
    } else if (finalOrderId) {
      // Create new payment record if none exists
      await Payment.create({
        orderId: finalOrderId,
        tx_ref: paymentData.tx_ref || `FFCO-${finalOrderId}-${Date.now()}`,
        transaction_id: transactionId,
        amount: parseFloat(paymentData.amount),
        currency: paymentData.currency || "RWF",
        paymentMethod: "Flutterwave",
        status: "successful",
        flutterwave_response: paymentData,
        verifiedAt: new Date()
      });
    }
      
    res.json({
      success: true,
      verified: true,
      data: paymentData,
    });
  } catch (error) {
    console.error("Flutterwave verify error:", error.response?.data || error);
    res.status(500).json({ success: false, message: error.response?.data?.message || "Payment verification failed" });
  }
});

// ============================================
// PESAPAL API 3.0 VERIFY & IPN ENDPOINTS
// ============================================

// Verify Pesapal payment
app.post("/api/pesapal/verify", async (req, res) => {
  try {
    const { orderRequestId, orderId, expectedAmount } = req.body;
    
    const order_request_id = orderRequestId;
    if (!order_request_id) {
      return res.status(400).json({ success: false, message: "Order Request ID required" });
    }
    
    // Check for duplicate verification
    const existingPayment = await Payment.findOne({ order_request_id: order_request_id, status: "completed" });
    if (existingPayment) {
      return res.status(400).json({ success: false, message: "Payment already verified", verified: true });
    }
    
    // Query Pesapal for order status
    const url = `${pesapalConfig.baseUrl}/api/Orders/OrderRequestId/${order_request_id}`;
    const { authHeader, timestamp, nonce } = generateOAuthSignature("GET", url);
    
    const response = await axios.get(url, {
      headers: {
        "Authorization": authHeader,
        "Timestamp": timestamp,
        "Nonce": nonce
      }
    });

    const paymentData = response.data;
    const status = paymentData.status || paymentData.order_status || "";
    
    if (status !== "completed") {
      return res.json({ success: true, verified: false, message: `Status: ${status}` });
    }
    
    const paidAmount = parseFloat(paymentData.amount || paymentData.total || 0);
    if (expectedAmount && paidAmount !== parseFloat(expectedAmount)) {
      return res.status(400).json({ success: false, message: "Amount mismatch" });
    }

    const paymentRecord = await Payment.findOne({ order_request_id: order_request_id });
    const finalOrderId = orderId || paymentRecord?.orderId;
    
    if (finalOrderId) {
      await Order.findByIdAndUpdate(finalOrderId, { 
        paymentMethod: "Pesapal",
        paymentStatus: "paid",
        status: "paid",
        orderStatus: "preparing"
      });
    }

    if (paymentRecord) {
      await Payment.findByIdAndUpdate(paymentRecord._id, {
        status: "completed",
        paymentMethod: "Pesapal",
        transaction_id: order_request_id,
        payment_response: paymentData,
        verifiedAt: new Date(),
        updatedAt: new Date()
      });
    }
       
    res.json({ success: true, verified: true, order_status: status, data: paymentData });
  } catch (error) {
    console.error("Pesapal verify error:", error.response?.data || error);
    res.status(500).json({ success: false, message: error.response?.data?.error?.message || "Verification failed" });
  }
});

// Pesapal IPN webhook handler
app.post("/api/pesapal/ipn", async (req, res) => {
  try {
    const ipnData = req.body;
    console.log("Pesapal IPN:", JSON.stringify(ipnData, null, 2));
    
    const orderRequestId = ipnData.OrderRequestId || ipnData.order_request_id;
    const status = ipnData.Status || ipnData.status;
    
    if (!orderRequestId) {
      return res.status(400).json({ error: "Missing OrderRequestId" });
    }

    let paymentStatus = "pending";
    if (status === "completed") paymentStatus = "completed";
    else if (status === "failed") paymentStatus = "failed";
    else if (status === "invalid") paymentStatus = "invalid";

    const paymentRecord = await Payment.findOne({ order_request_id: orderRequestId });
    
    if (paymentRecord) {
      const orderId = paymentRecord.orderId;
      
      if (orderId) {
        await Order.findByIdAndUpdate(orderId, { 
          paymentMethod: "Pesapal",
          paymentStatus: paymentStatus === "completed" ? "paid" : "failed",
          status: paymentStatus === "completed" ? "paid" : "failed",
          orderStatus: paymentStatus === "completed" ? "preparing" : "pending"
        });
      }

      await Payment.findByIdAndUpdate(paymentRecord._id, {
        status: paymentStatus,
        ipn_response: ipnData,
        verifiedAt: paymentStatus === "completed" ? new Date() : null,
        updatedAt: new Date()
      });
    }

    res.json({ received: true });
  } catch (error) {
    console.error("IPN error:", error);
    res.status(500).json({ error: "IPN failed" });
  }
});

// Flutterwave webhook handler
app.post("/api/flutterwave/webhook", async (req, res) => {
  try {
    const secretHash = process.env.FLW_SECRET_KEY;
    const signature = req.headers["verif-hash"] || req.headers["flutterwave-signature"];
    
    // Verify webhook signature for security (optional in development)
    // In production, uncomment the signature verification
    /*
    if (secretHash && signature) {
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(secretHash + req.rawBody).digest('hex');
      if (signature !== hash) {
        console.error("Invalid webhook signature");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }
    */

    const event = req.body;
    console.log("Flutterwave webhook received:", JSON.stringify(event, null, 2));
    
    if (event.event === "charge.completed" && event.data.status === "successful") {
      const paymentData = event.data;
      const orderId = paymentData.meta?.orderId || paymentData.metadata?.orderId;
      const userId = paymentData.meta?.userId || paymentData.metadata?.userId;
      
      console.log(`Processing payment for order: ${orderId}, user: ${userId}`);
      
      if (orderId) {
        // Update order with payment status
        await Order.findByIdAndUpdate(orderId, { 
          paymentMethod: "Flutterwave",
          paymentStatus: "paid",
          status: "paid",
          orderStatus: "preparing",
          userId: userId
        });
        
        // Update or create payment record
        const existingPayment = await Payment.findOne({ transaction_id: paymentData.id.toString() });
        if (existingPayment) {
          await Payment.findByIdAndUpdate(existingPayment._id, {
            status: "successful",
            flutterwave_response: paymentData,
            verifiedAt: new Date(),
            updatedAt: new Date()
          });
        } else {
          await Payment.create({
            orderId: orderId,
            userId: userId || null,
            tx_ref: paymentData.tx_ref,
            transaction_id: paymentData.id.toString(),
            amount: parseFloat(paymentData.amount),
            currency: paymentData.currency || "RWF",
            paymentMethod: "Flutterwave",
            status: "successful",
            flutterwave_response: paymentData,
            verifiedAt: new Date()
          });
        }
        
        console.log(`Payment successful for order ${orderId}`);
      }
    } else if (event.event === "charge.failed") {
      // Handle failed payment
      const orderId = event.data.meta?.orderId || event.data.metadata?.orderId;
      if (orderId) {
        await Order.findByIdAndUpdate(orderId, { 
          paymentMethod: "Flutterwave",
          paymentStatus: "failed",
          status: "failed"
        });
        
        await Payment.findOneAndUpdate(
          { orderId: orderId },
          { status: "failed", flutterwave_response: event.data, updatedAt: new Date() }
        );
        
        console.log(`Payment failed for order ${orderId}`);
      }
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// UPLOAD / UPDATE profile image
app.post("/api/users/upload-profile", checkDbConnection, profileUpload.single("profileImage"), async (req, res) => {
  try {
    const { userId } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    
    const imagePath = `/uploads/profiles/${req.file.filename}`;
    await User.findByIdAndUpdate(userId, { profileImage: imagePath });
    res.json({ success: true, profileImage: imagePath });
  } catch (err) {
    res.status(500).json({ success: false, message: "Database error" });
  }
});

// UPDATE USER PROFILE
app.put("/api/users/update-profile/:id", checkDbConnection, async (req, res) => {
  try {
    const userId = req.params.id;
    const { username, email, phone } = req.body;

    if (!username || !email) {
      return res.status(400).json({
        success: false,
        message: "Username and email are required"
      });
    }

    const emailCheck = await User.findOne({ email, _id: { $ne: userId } });
    if (emailCheck) {
      return res.status(400).json({
        success: false,
        message: "Email is already in use by another account"
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { username, email, phone },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser
    });
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update profile"
    });
  }
});

// CHANGE PASSWORD
app.post("/api/users/change-password", checkDbConnection, async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;
    if (!userId || !currentPassword || !newPassword)
      return res.status(400).json({ success: false, message: "Missing fields" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(400).json({ success: false, message: "Current password is incorrect" });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to update password" });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    timestamp: new Date().toISOString()
  });
});

// =============================
// 🚀 START SERVER
// =============================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║  🚀 Server running on port ${PORT}               ║
║  📍 ${BASE_URL}              ║
║  🌐 Client: ${CLIENT_URL}              ║
║  🗄️  MongoDB: ${MONGODB_URI.substring(0, 30)}...  ║
╚════════════════════════════════════════════════╝
  `);
});
