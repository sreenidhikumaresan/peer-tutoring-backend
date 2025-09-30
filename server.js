const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const app = express();
const port = process.env.PORT || 5000;

// IMPORTANT: Paste your full connection string here
const dbConnectionString = 'Server=tcp:pse10-sql-server-dvs.database.windows.net,1433;Initial Catalog=pse10-db;Persist Security Info=False;User ID=sqladmin;Password=Project@123;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;';

// Middleware
app.use(cors());
app.use(express.json());

// Function to connect to the database and create tables if they don't exist
async function initializeDatabase() {
  try {
    await sql.connect(dbConnectionString);
    console.log('Connected to the database.');

    const request = new sql.Request();
    // Create TutorOffers table if it doesn't exist
    await request.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TutorOffers' and xtype='U')
      CREATE TABLE TutorOffers (
        id INT PRIMARY KEY IDENTITY(1,1),
        name NVARCHAR(255) NOT NULL,
        number NVARCHAR(50),
        schedule NVARCHAR(255)
      )
    `);
    // Create LearnRequests table if it doesn't exist
    await request.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LearnRequests' and xtype='U')
      CREATE TABLE LearnRequests (
        id INT PRIMARY KEY IDENTITY(1,1),
        topic NVARCHAR(255) NOT NULL,
        fileName NVARCHAR(255)
      )
    `);
    console.log('Tables are ready.');
  } catch (err) {
    console.error('Database connection failed:', err);
  }
}

// API Routes
app.get('/api/test', (req, res) => {
  res.json({ message: 'Hello from the backend API!' });
});

// --- ROUTES FOR LEARN REQUESTS ---
app.post('/api/learn', async (req, res) => {
  try {
    const { topic, fileName } = req.body;
    const request = new sql.Request();
    await request.query`INSERT INTO LearnRequests (topic, fileName) VALUES (${topic}, ${fileName})`;
    res.status(201).json({ message: 'Learn request added successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error adding learn request.' });
  }
});

app.get('/api/learn', async (req, res) => {
  try {
    const request = new sql.Request();
    const result = await request.query`SELECT * FROM LearnRequests`;
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching learn requests.' });
  }
});

// --- ROUTES FOR TUTOR OFFERS ---
app.post('/api/tutor', async (req, res) => {
  try {
    const { name, number, schedule } = req.body;
    const request = new sql.Request();
    await request.query`INSERT INTO TutorOffers (name, number, schedule) VALUES (${name}, ${number}, ${schedule})`;
    res.status(201).json({ message: 'Tutor offer added successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error adding tutor offer.' });
  }
});

app.get('/api/tutor', async (req, res) => {
  try {
    const request = new sql.Request();
    const result = await request.query`SELECT * FROM TutorOffers`;
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching tutor offers.' });
  }
});

// Start the server and initialize the database
app.listen(port, () => {
  console.log(`Backend server is listening on port ${port}`);
  initializeDatabase();
});