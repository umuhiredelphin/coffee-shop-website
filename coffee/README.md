# F&F Coffee - Backend Server

## 🚀 Quick Start with MongoDB

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)

### Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Start MongoDB:**
   - Make sure MongoDB is running on your system
   - Default connection: `mongodb://localhost:27017/ffcoffee`

3. **Setup database (first time only):**
```bash
npm run setup
```

4. **Start the server:**
```bash
npm start
```

The server will run on `http://localhost:5000`

---

## 📦 Database Collections (MongoDB)

The following collections will be created automatically:

| Collection | Description |
|------------|-------------|
| `users` | Customer accounts |
| `admins` | Admin accounts |
| `menus` | Coffee shop menu items |
| `tables` | Restaurant tables |
| `bookings` | Table reservations |
| `orders` | Customer orders |
| `payments` | Payment records |

---

## 🔐 Default Login Credentials

### Admin Login
- **Email:** admin@ffcoffee.com
- **Password:** admin123

### User Login
- **Email:** user@example.com
- **Password:** user123

---

## 📡 API Endpoints

### User Authentication
- `POST /api/signup` - User registration
- `POST /api/login` - User login
- `POST /api/forgot-password` - Forgot password
- `POST /api/reset-password/:token` - Reset password

### Admin Authentication
- `POST /api/admin/register` - Admin registration
- `POST /api/admin/login` - Admin login
- `POST /api/admin/forgot` - Admin forgot password
- `POST /api/admin/reset/verify` - Verify reset code
- `POST /api/admin/reset` - Reset admin password

### Users
- `GET /api/users` - Get all users
- `GET /api/users/profile/:id` - Get user profile
- `GET /api/users/by-email/:email` - Get user by email
- `PUT /api/users/update-profile/:id` - Update user profile
- `POST /api/users/upload-profile` - Upload profile image
- `POST /api/users/change-password` - Change password

### Menu
- `GET /api/menu` - Get all menu items
- `POST /api/menu` - Add menu item
- `DELETE /api/menu/:id` - Delete menu item

### Tables
- `GET /api/tables` - Get all tables
- `POST /api/tables` - Add table
- `PUT /api/tables/:id` - Update table
- `DELETE /api/tables/:id` - Delete table

### Bookings
- `GET /api/bookings` - Get all bookings
- `POST /api/bookings` - Create booking
- `PUT /api/bookings/:id` - Update booking status
- `DELETE /api/bookings/:id` - Delete booking

### Orders
- `GET /api/cart/orders/:buyer` - Get orders by buyer
- `POST /api/cart/confirm` - Confirm cart order
- `GET /api/admin/orders` - Get all orders (admin)
- `PATCH /api/admin/orders/:id/status` - Update order status
- `DELETE /api/admin/orders/:id` - Delete order

### Payments
- `GET /api/payments/history/:userId` - Get payment history

### Health Check
- `GET /api/health` - Server health check

---

## 🗄️ MongoDB Schema

### User Schema
```javascript
{
  username: String,
  email: String (unique),
  phone: String,
  password: String,
  profileImage: String,
  createdAt: Date
}
```

### Admin Schema
```javascript
{
  username: String,
  email: String (unique),
  password: String,
  resetCode: String,
  resetExpiry: Number,
  createdAt: Date
}
```

### Menu Schema
```javascript
{
  name: String,
  price: Number,
  currency: String,
  description: String,
  image: String,
  category: String,
  rating: Number,
  isPopular: Boolean,
  isNew: Boolean,
  createdAt: Date
}
```

### Table Schema
```javascript
{
  tableNumber: String (unique),
  tableImage: String,
  createdAt: Date
}
```

### Booking Schema
```javascript
{
  name: String,
  email: String,
  tableId: String,
  date: Date,
  time: String,
  status: String,
  createdAt: Date
}
```

### Order Schema
```javascript
{
  buyerName: String,
  foodName: String,
  quantity: Number,
  total: Number,
  status: String,
  paymentMethod: String,
  orderType: String,
  prepStart: Date,
  prepFinish: Date,
  isRead: Boolean,
  createdAt: Date
}
```

### Payment Schema
```javascript
{
  userId: ObjectId (ref: User),
  orderId: ObjectId,
  amount: Number,
  currency: String,
  paymentMethod: String,
  status: String,
  description: String,
  createdAt: Date
}
```

---

## 🔧 Environment Variables

Create a `.env` file in the root directory:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/ffcoffee
JWT_SECRET=your_secret_key
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
BASE_URL=http://localhost:5000
CLIENT_URL=http://localhost:3000
```

---

## 📁 Project Structure

```
coffee/
├── server.js           # Main server file
├── setup-mongodb.js    # Database setup script
├── package.json        # Dependencies
├── .env               # Environment variables
├── uploads/           # Uploaded images
│   ├── profiles/      # Profile images
│   └── ...            # Menu/table images
└── README.md          # This file
```

---

## 🛠️ Troubleshooting

### MongoDB Connection Error
- Make sure MongoDB is running: `mongod`
- Check if the database URI is correct in `.env`
- Default port for MongoDB is 27017

### Port Already in Use
- Change the PORT in `.env` file
- Or kill the process using port 5000: `lsof -i :5000`

### Email Not Sending
- Use Gmail App Password instead of regular password
- Enable 2-factor authentication in Gmail
- Generate App Password: Google Account > Security > App Passwords
