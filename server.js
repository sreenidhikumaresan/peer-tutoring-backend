const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const crypto = require('crypto'); // Used for generating a secure token

const app = express();
const port = process.env.PORT || 8080;

// IMPORTANT: Your full connection string with the NEW server and password
const dbConnectionString = 'Server=tcp:pse10-sql-server-new.database.windows.net,1433;Initial Catalog=pse10-db;Persist Security Info=False;User ID=sqladmin;Password=Project@1;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;';

// Middleware
app.use(cors());
app.use(express.json());

// Create a global connection pool
let pool;
async function connectToDatabase() {
  try {
    if (!pool || !pool.connected) {
      pool = new sql.ConnectionPool(dbConnectionString);
      await pool.connect();
      console.log('Database connection pool created.');
      
      pool.on('error', err => {
        console.error('SQL Connection Pool Error:', err);
      });
    }
    return pool;
  } catch (err) {
    console.error('Database connection failed:', err);
    pool = null; 
    throw err; 
  }
}

// Function to initialize tables and add new columns
async function initializeDatabase() {
  try {
    const db = await connectToDatabase();
    const request = db.request();
    // Add new columns for password reset functionality
    await request.query(`
      IF COL_LENGTH('Users', 'email') IS NULL ALTER TABLE Users ADD email NVARCHAR(255);
      IF COL_LENGTH('Users', 'resetToken') IS NULL ALTER TABLE Users ADD resetToken NVARCHAR(255);
      IF COL_LENGTH('Users', 'resetTokenExpiry') IS NULL ALTER TABLE Users ADD resetTokenExpiry DATETIME;
    `);
    console.log('Database schema is up to date.');
  } catch (err) {
    console.error('FATAL: Database initialization failed:', err);
    process.exit(1);
  }
}

// API Routes
app.get('/api/test', (req, res) => {
  res.json({ message: 'Hello from the backend API!' });
});

// --- SIGNUP ROUTE ---
app.post('/api/signup', async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    if (!name || !username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    const db = await connectToDatabase();
    await db.request().query`INSERT INTO Users (name, username, email, password) VALUES (${name}, ${username}, ${email}, ${password})`;
    res.status(201).json({ message: 'User created successfully!' });
  } catch (err) {
    if (err.number === 2627) { 
        return res.status(409).json({ message: 'Username or email already exists.' });
    }
    console.error('Signup Error:', err);
    res.status(500).json({ message: 'Error creating user.' });
  }
});

// --- LOGIN ROUTE ---
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    const db = await connectToDatabase();
    const result = await db.request().query`SELECT * FROM Users WHERE username = ${username} AND password = ${password}`;
    if (result.recordset.length > 0) {
      res.json({ message: 'Login successful!', user: result.recordset[0] });
    } else {
      res.status(401).json({ message: 'Invalid username or password.' });
    }
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ message: 'Error during login.' });
  }
});

// --- NEW FORGOT PASSWORD ROUTE ---
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { username } = req.body;
    const db = await connectToDatabase();
    const userResult = await db.request().query`SELECT * FROM Users WHERE username = ${username}`;

    if (userResult.recordset.length > 0) {
      const token = crypto.randomBytes(20).toString('hex');
      const expiry = new Date(Date.now() + 3600000); // 1 hour from now

      await db.request().query`UPDATE Users SET resetToken = ${token}, resetTokenExpiry = ${expiry} WHERE username = ${username}`;
      
      // In a real app, you would use a service like SendGrid to email this link.
      // For this project, we log it to the console for testing.
      const resetLink = `(YOUR_FRONTEND_URL)/reset-password.html?token=${token}`;
      console.log('--- PASSWORD RESET LINK (FOR TESTING) ---');
      console.log(resetLink);
      console.log('-----------------------------------------');
    }
    // For security, always send a generic success message.
    res.json({ message: 'If a user with that username exists, a password reset link has been generated.' });
  } catch (err) {
    console.error('Forgot Password Error:', err);
    res.status(500).json({ message: 'An error occurred.' });
  }
});

// --- NEW RESET PASSWORD ROUTE ---
app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    const db = await connectToDatabase();
    
    const userResult = await db.request().query`SELECT * FROM Users WHERE resetToken = ${token} AND resetTokenExpiry > GETDATE()`;

    if (userResult.recordset.length === 0) {
      return res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
    }
    const user = userResult.recordset[0];
    
    // Update password and invalidate the token
    await db.request().query`UPDATE Users SET password = ${password}, resetToken = NULL, resetTokenExpiry = NULL WHERE id = ${user.id}`;
    
    res.json({ message: 'Password has been updated successfully.' });
  } catch (err) {
    console.error('Reset Password Error:', err);
    res.status(500).json({ message: 'An error occurred.' });
  }
});


// --- LEARN & TUTOR ROUTES (No changes needed) ---
app.post('/api/learn', async (req, res) => { /* ... existing code ... */ });
app.get('/api/learn', async (req, res) => { /* ... existing code ... */ });
app.post('/api/tutor', async (req, res) => { /* ... existing code ... */ });
app.get('/api/tutor', async (req, res) => { /* ... existing code ... */ });


// Start Server
app.listen(port, async () => {
  console.log(`Server is starting and listening on port ${port}`);
  await initializeDatabase();
}); 