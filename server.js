const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const app = express();
const port = process.env.PORT || 8080;

// IMPORTANT: Your full connection string
const dbConnectionString = 'Server=tcp:pse10-sql-server-dvs.database.windows.net,1433;Initial Catalog=pse10-db;Persist Security Info=False;User ID=sqladmin;Password=Project@123;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;';

// Middleware
app.use(cors());
app.use(express.json());

// Create a global connection pool
const pool = new sql.ConnectionPool(dbConnectionString);
const poolConnect = pool.connect();

pool.on('error', err => {
  console.error('SQL Connection Pool Error:', err);
});

// Function to initialize tables
async function initializeTables() {
  await poolConnect; // Ensures the pool is connected
  try {
    const request = pool.request();
    // Create Users, TutorOffers, and LearnRequests tables
    await request.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' and xtype='U') CREATE TABLE Users (id INT PRIMARY KEY IDENTITY(1,1), name NVARCHAR(255) NOT NULL, username NVARCHAR(50) UNIQUE NOT NULL, password NVARCHAR(255) NOT NULL);
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TutorOffers' and xtype='U') CREATE TABLE TutorOffers (id INT PRIMARY KEY IDENTITY(1,1), name NVARCHAR(255) NOT NULL, number NVARCHAR(50), schedule NVARCHAR(255));
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LearnRequests' and xtype='U') CREATE TABLE LearnRequests (id INT PRIMARY KEY IDENTITY(1,1), topic NVARCHAR(255) NOT NULL, fileName NVARCHAR(255));
    `);
    console.log('Tables are initialized and ready.');
  } catch (err) {
    console.error('Error initializing tables:', err);
    // Exit if we can't create tables, as the app won't work
    process.exit(1); 
  }
}

// API Routes
app.get('/api/test', (req, res) => {
  res.json({ message: 'Hello from the backend API!' });
});

// --- SIGNUP/LOGIN ROUTES ---
// (Your existing signup/login code would go here)
// ...

// --- OTHER ROUTES ---
// (Your existing learn/tutor routes would go here)
// ...

// Start the server and initialize the database
app.listen(port, async () => {
  console.log(`Backend server is listening on port ${port}`);
  await initializeTables();
});