const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 8080;

// IMPORTANT: Your full connection string
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
      pool.on('error', err => console.error('SQL Connection Pool Error:', err));
    }
    return pool;
  } catch (err) {
    console.error('Database connection failed:', err);
    pool = null; 
    throw err; 
  }
}

// Function to initialize tables
async function initializeDatabase() {
  try {
    const db = await connectToDatabase();
    const request = db.request();
    // Ensure all tables and columns exist
    await request.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' and xtype='U') CREATE TABLE Users (id INT PRIMARY KEY IDENTITY(1,1), name NVARCHAR(255) NOT NULL, username NVARCHAR(50) UNIQUE NOT NULL, email NVARCHAR(255) UNIQUE, password NVARCHAR(255) NOT NULL, resetToken NVARCHAR(255), resetTokenExpiry DATETIME);
      IF COL_LENGTH('Users', 'email') IS NULL ALTER TABLE Users ADD email NVARCHAR(255) UNIQUE;
      IF COL_LENGTH('Users', 'resetToken') IS NULL ALTER TABLE Users ADD resetToken NVARCHAR(255);
      IF COL_LENGTH('Users', 'resetTokenExpiry') IS NULL ALTER TABLE Users ADD resetTokenExpiry DATETIME;
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TutorOffers' and xtype='U') CREATE TABLE TutorOffers (id INT PRIMARY KEY IDENTITY(1,1), name NVARCHAR(255) NOT NULL, number NVARCHAR(50), schedule NVARCHAR(255));
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LearnRequests' and xtype='U') CREATE TABLE LearnRequests (id INT PRIMARY KEY IDENTITY(1,1), topic NVARCHAR(255) NOT NULL, fileName NVARCHAR(255));
    `);
    console.log('Database schema is up to date.');
  } catch (err) {
    console.error('FATAL: Database initialization failed:', err);
    process.exit(1); 
  }
}

// API Routes
app.get('/api/test', (req, res) => res.json({ message: 'Hello from the backend API!' }));

// --- SIGNUP ROUTE ---
app.post('/api/signup', async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    if (!name || !username || !email || !password) return res.status(400).json({ message: 'All fields are required.' });
    const db = await connectToDatabase();
    await db.request().query`INSERT INTO Users (name, username, email, password) VALUES (${name}, ${username}, ${email}, ${password})`;
    res.status(201).json({ message: 'User created successfully!' });
  } catch (err) {
    if (err.number === 2627) return res.status(409).json({ message: 'Username or email already exists.' });
    console.error('Signup Error:', err);
    res.status(500).json({ message: 'Error creating user.' });
  }
});

// --- LOGIN ROUTE ---
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username and password are required.' });
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

// --- FORGOT PASSWORD ROUTE (UPDATED) ---
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const pool = await sql.connect(dbConnectionString);
    const userResult = await pool.request().query`SELECT * FROM Users WHERE email = ${email}`;

    if (userResult.recordset.length > 0) {
      const user = userResult.recordset[0];
      const token = crypto.randomBytes(20).toString('hex');
      const expiry = new Date(Date.now() + 3600000); // 1 hour

      await pool.request().query`UPDATE Users SET resetToken = ${token}, resetTokenExpiry = ${expiry} WHERE email = ${email}`;
      
      const frontendUrl = "https://pse10-frontend-site-ffgrdtdvfveec0du.centralindia-01.azurewebsites.net";
      const resetLink = `${frontendUrl}/reset-password.html?token=${token}`;

      // --- EMAIL SENDING LOGIC ---
      const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
      const senderAddress = process.env.SENDER_EMAIL_ADDRESS;
      const emailClient = new EmailClient(connectionString);

      const message = {
        senderAddress: senderAddress,
        content: {
          subject: "Password Reset for Peer Tutoring",
          plainText: `You requested a password reset. Please click the following link to reset your password:\n\n${resetLink}\n\nIf you did not request this, please ignore this email.`,
        },
        recipients: { to: [{ address: user.email }] },
      };

      const poller = await emailClient.beginSend(message);
      await poller.pollUntilDone();
      console.log(`Password reset email sent to ${user.email}`);
      // --- END EMAIL LOGIC ---
    }
    
    res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (err) {
    console.error('Forgot Password Error:', err);
    res.status(500).json({ message: 'An error occurred while sending the reset email.' });
  }
});

// --- RESET PASSWORD ROUTE ---
app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    const db = await connectToDatabase();
    const userResult = await db.request().query`SELECT * FROM Users WHERE resetToken = ${token} AND resetTokenExpiry > GETDATE()`;
    if (userResult.recordset.length === 0) {
      return res.status(400).json({ message: 'Password reset token is invalid or has expired.' });
    }
    const user = userResult.recordset[0];
    await db.request().query`UPDATE Users SET password = ${password}, resetToken = NULL, resetTokenExpiry = NULL WHERE id = ${user.id}`;
    res.json({ message: 'Password has been updated successfully.' });
  } catch (err) {
    console.error('Reset Password Error:', err);
    res.status(500).json({ message: 'An error occurred.' });
  }
});

// --- LEARN REQUESTS ROUTES ---
app.post('/api/learn', async (req, res) => {
  try {
    const { topic, fileName } = req.body;
    const db = await connectToDatabase();
    await db.request().query`INSERT INTO LearnRequests (topic, fileName) VALUES (${topic}, ${fileName})`;
    res.status(201).json({ message: 'Learn request added successfully!' });
  } catch (err) { res.status(500).json({ message: 'Error adding learn request.' }) }
});

app.get('/api/learn', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const result = await db.request().query`SELECT * FROM LearnRequests`;
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: 'Error fetching learn requests.' }) }
});

// --- TUTOR OFFERS ROUTES ---
app.post('/api/tutor', async (req, res) => {
  try {
    const { name, number, schedule } = req.body;
    const db = await connectToDatabase();
    await db.request().query`INSERT INTO TutorOffers (name, number, schedule) VALUES (${name}, ${number}, ${schedule})`;
    res.status(201).json({ message: 'Tutor offer added successfully!' });
  } catch (err) { res.status(500).json({ message: 'Error adding tutor offer.' }) }
});

app.get('/api/tutor', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const result = await db.request().query`SELECT * FROM TutorOffers`;
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: 'Error fetching tutor offers.' }) }
});

// Start Server
app.listen(port, async () => {
  console.log(`Server is starting and listening on port ${port}`);
  await initializeDatabase();
});