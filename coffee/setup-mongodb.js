import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/ffcoffee";

console.log("🔄 Connecting to MongoDB...");

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB Database");
    setupDatabase();
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });

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
  tableId: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  status: { type: String, default: "Pending" },
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
  paymentMethod: { type: String, default: "Cash" },
  orderType: { type: String, default: "dine-in" },
  prepStart: { type: Date },
  prepFinish: { type: Date },
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model("Order", orderSchema);

// Payment Schema
const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  orderId: { type: mongoose.Schema.Types.ObjectId },
  amount: { type: Number, required: true },
  currency: { type: String, default: "RWF" },
  paymentMethod: { type: String },
  status: { type: String, default: "pending" },
  description: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const Payment = mongoose.model("Payment", paymentSchema);

// =============================
// 📦 SETUP DATABASE
// =============================
async function setupDatabase() {
  try {
    console.log("\n🔄 Setting up database...\n");

    // Create default admin
    const existingAdmin = await Admin.findOne({ email: "admin@ffcoffee.com" });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      const admin = new Admin({
        username: "Admin",
        email: "admin@ffcoffee.com",
        password: hashedPassword
      });
      await admin.save();
      console.log("✅ Default admin created (admin@ffcoffee.com / admin123)");
    } else {
      console.log("ℹ️  Admin already exists");
    }

    // Create sample menu items
    const menuCount = await Menu.countDocuments();
    if (menuCount === 0) {
      const sampleMenu = [
        { name: "Espresso", price: 2500, currency: "RWF", description: "Strong black coffee", category: "coffee", rating: 4.5, isPopular: true },
        { name: "Cappuccino", price: 3500, currency: "RWF", description: "Espresso with steamed milk foam", category: "coffee", rating: 4.7, isPopular: true },
        { name: "Latte", price: 4000, currency: "RWF", description: "Espresso with steamed milk", category: "coffee", rating: 4.6, isPopular: true },
        { name: "Mocha", price: 4500, currency: "RWF", description: "Chocolate coffee with whipped cream", category: "coffee", rating: 4.8, isNew: true },
        { name: "Croissant", price: 2000, currency: "RWF", description: "Buttery French pastry", category: "pastry", rating: 4.3, isPopular: true },
        { name: "Chocolate Cake", price: 5000, currency: "RWF", description: "Rich chocolate layer cake", category: "dessert", rating: 4.9, isNew: true },
        { name: "Club Sandwich", price: 6000, currency: "RWF", description: "Triple-decker sandwich", category: "food", rating: 4.4 },
        { name: "Fresh Juice", price: 3000, currency: "RWF", description: "Freshly squeezed orange juice", category: "beverage", rating: 4.2 }
      ];
      await Menu.insertMany(sampleMenu);
      console.log("✅ Sample menu items created");
    } else {
      console.log("ℹ️  Menu items already exist");
    }

    // Create sample tables
    const tableCount = await Table.countDocuments();
    if (tableCount === 0) {
      const sampleTables = [
        { tableNumber: "1", tableImage: "/uploads/default-table.jpg" },
        { tableNumber: "2", tableImage: "/uploads/default-table.jpg" },
        { tableNumber: "3", tableImage: "/uploads/default-table.jpg" },
        { tableNumber: "4", tableImage: "/uploads/default-table.jpg" },
        { tableNumber: "5", tableImage: "/uploads/default-table.jpg" }
      ];
      await Table.insertMany(sampleTables);
      console.log("✅ Sample tables created");
    } else {
      console.log("ℹ️  Tables already exist");
    }

    // Create sample user
    const existingUser = await User.findOne({ email: "user@example.com" });
    if (!existingUser) {
      const hashedPassword = await bcrypt.hash("user123", 10);
      const user = new User({
        username: "John Doe",
        email: "user@example.com",
        phone: "+250788123456",
        password: hashedPassword
      });
      await user.save();
      console.log("✅ Sample user created (user@example.com / user123)");
    } else {
      console.log("ℹ️  Sample user already exists");
    }

    console.log("\n╔════════════════════════════════════════════════╗");
    console.log("║  ✅ Database setup complete!                    ║");
    console.log("║                                                ║");
    console.log("║  Admin Login:                                  ║");
    console.log("║    Email: admin@ffcoffee.com                   ║");
    console.log("║    Password: admin123                          ║");
    console.log("║                                                ║");
    console.log("║  User Login:                                   ║");
    console.log("║    Email: user@example.com                     ║");
    console.log("║    Password: user123                           ║");
    console.log("╚════════════════════════════════════════════════╝\n");

    process.exit(0);
  } catch (err) {
    console.error("❌ Setup failed:", err);
    process.exit(1);
  }
}
