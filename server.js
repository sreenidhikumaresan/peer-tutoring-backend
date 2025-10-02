const express = require('express');
const cors = require('cors');
const sql = require('mssql');

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

// Function to initialize tables
async function initializeTables() {
  try {
    const db = await connectToDatabase();
    const request = db.request();
    await request.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' and xtype='U') CREATE TABLE Users (id INT PRIMARY KEY IDENTITY(1,1), name NVARCHAR(255) NOT NULL, username NVARCHAR(50) UNIQUE NOT NULL, password NVARCHAR(255) NOT NULL);
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TutorOffers' and xtype='U') CREATE TABLE TutorOffers (id INT PRIMARY KEY IDENTITY(1,1), name NVARCHAR(255) NOT NULL, number NVARCHAR(50), schedule NVARCHAR(255));
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LearnRequests' and xtype='U') CREATE TABLE LearnRequests (id INT PRIMARY KEY IDENTITY(1,1), topic NVARCHAR(255) NOT NULL, fileName NVARCHAR(255));
    `);
    console.log('Tables are initialized and ready.');
  } catch (err) {
    console.error('Error initializing tables:', err);
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
    const { name, username, password } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    const db = await connectToDatabase();
    const request = db.request();
    await request.query`INSERT INTO Users (name, username, password) VALUES (${name}, ${username}, ${password})`;
    res.status(201).json({ message: 'User created successfully!' });
  } catch (err) {
    if (err.number === 2627) {
        return res.status(409).json({ message: 'Username already exists.' });
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
    const request = db.request();
    const result = await request.query`SELECT * FROM Users WHERE username = ${username} AND password = ${password}`;

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

// --- LEARN REQUESTS ROUTES ---
app.post('/api/learn', async (req, res) => {
  try {
    const { topic, fileName } = req.body;
    const db = await connectToDatabase();
    const request = db.request();
    await request.query`INSERT INTO LearnRequests (topic, fileName) VALUES (${topic}, ${fileName})`;
    res.status(201).json({ message: 'Learn request added successfully!' });
  } catch (err) { 
    console.error('Error adding learn request:', err);
    res.status(500).json({ message: 'Error adding learn request.' });
  }
});

app.get('/api/learn', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const request = db.request();
    const result = await request.query`SELECT * FROM LearnRequests`;
    res.json(result.recordset);
  } catch (err) { 
    console.error('Error fetching learn requests:', err);
    res.status(500).json({ message: 'Error fetching learn requests.' });
  }
});

// --- TUTOR OFFERS ROUTES ---
app.post('/api/tutor', async (req, res) => {
  try {
    const { name, number, schedule } = req.body;
    const db = await connectToDatabase();
    const request = db.request();
    await request.query`INSERT INTO TutorOffers (name, number, schedule) VALUES (${name}, ${number}, ${schedule})`;
    res.status(201).json({ message: 'Tutor offer added successfully!' });
  } catch (err) { 
    console.error('Error adding tutor offer:', err);
    res.status(500).json({ message: 'Error adding tutor offer.' });
  }
});

app.get('/api/tutor', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const request = db.request();
    const result = await request.query`SELECT * FROM TutorOffers`;
    res.json(result.recordset);
  } catch (err) { 
    console.error('Error fetching tutor offers:', err);
    res.status(500).json({ message: 'Error fetching tutor offers.' });
  }
});

// Start the server
app.listen(port, async () => {
  console.log(`Backend server is listening on port ${port}`);
  await initializeTables();
});