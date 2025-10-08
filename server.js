const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const crypto = require('crypto');
const { EmailClient } = require("@azure/communication-email");

const app = express();
const port = process.env.PORT || 8080;

// --- DATABASE CONNECTION STRING ---
const dbConnectionString =
  'Server=tcp:pse10-sql-server-new.database.windows.net,1433;Initial Catalog=pse10-db;Persist Security Info=False;User ID=sqladmin;Password=Project@1;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;';

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// --- DATABASE INITIALIZATION ---
async function initializeDatabase() {
  try {
    const pool = await sql.connect(dbConnectionString);
    const request = pool.request();

    await request.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' and xtype='U') 
        CREATE TABLE Users (
          id INT PRIMARY KEY IDENTITY(1,1),
          name NVARCHAR(255) NOT NULL,
          username NVARCHAR(50) UNIQUE NOT NULL,
          email NVARCHAR(255) UNIQUE,
          password NVARCHAR(255) NOT NULL,
          resetToken NVARCHAR(255),
          resetTokenExpiry DATETIME
        );

      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TutorOffers' and xtype='U') 
        CREATE TABLE TutorOffers (
          id INT PRIMARY KEY IDENTITY(1,1),
          name NVARCHAR(255) NOT NULL,
          number NVARCHAR(50),
          schedule NVARCHAR(255)
        );

      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LearnRequests' and xtype='U') 
        CREATE TABLE LearnRequests (
          id INT PRIMARY KEY IDENTITY(1,1),
          topic NVARCHAR(255) NOT NULL,
          fileName NVARCHAR(255),
          requestedByUsername NVARCHAR(255)
        );

      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Proposals' and xtype='U') 
        CREATE TABLE Proposals (
          id INT PRIMARY KEY IDENTITY(1,1),
          proposerUsername NVARCHAR(255),
          recipientUsername NVARCHAR(255),
          topic NVARCHAR(255),
          proposedDate DATE,
          proposedTime TIME,
          status NVARCHAR(50) DEFAULT 'pending',
          lastUpdated DATETIME DEFAULT GETDATE()
        );
    `);

    console.log('✅ Database schema is ready.');
  } catch (err) {
    console.error('❌ Database initialization failed:', err);
    process.exit(1);
  }
}

// --- BASIC ROUTES ---
app.get('/api/test', (req, res) => res.json({ message: 'Hello from backend!' }));

// --- SIGNUP ---
app.post('/api/signup', async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    if (!name || !username || !email || !password)
      return res.status(400).json({ message: 'All fields are required.' });

    const pool = await sql.connect(dbConnectionString);
    await pool.request()
      .query`INSERT INTO Users (name, username, email, password) VALUES (${name}, ${username}, ${email}, ${password})`;

    res.status(201).json({ message: 'User created successfully!' });
  } catch (err) {
    if (err.number === 2627)
      return res.status(409).json({ message: 'Username or email already exists.' });
    res.status(500).json({ message: 'Error creating user.' });
  }
});

// --- LOGIN ---
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const pool = await sql.connect(dbConnectionString);
    const result = await pool.request()
      .query`SELECT * FROM Users WHERE username = ${username} AND password = ${password}`;
    if (result.recordset.length > 0) res.json({ message: 'Login successful!', user: result.recordset[0] });
    else res.status(401).json({ message: 'Invalid username or password.' });
  } catch {
    res.status(500).json({ message: 'Error during login.' });
  }
});

// --- FORGOT PASSWORD ---
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const pool = await sql.connect(dbConnectionString);
    const userResult = await pool.request().query`SELECT * FROM Users WHERE email = ${email}`;
    if (userResult.recordset.length === 0)
      return res.json({ message: 'If an account exists, an email has been sent.' });

    const user = userResult.recordset[0];
    const token = crypto.randomBytes(20).toString('hex');
    const expiry = new Date(Date.now() + 3600000);

    await pool.request()
      .query`UPDATE Users SET resetToken = ${token}, resetTokenExpiry = ${expiry} WHERE email = ${email}`;

    const frontendUrl = "https://pse10-frontend-site-ffgrdtdvfveec0du.centralindia-01.azurewebsites.net";
    const resetLink = `${frontendUrl}/reset-password.html?token=${token}`;

    const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
    const senderAddress = process.env.SENDER_EMAIL_ADDRESS;
    const emailClient = new EmailClient(connectionString);
    const message = {
      senderAddress,
      content: { subject: "Password Reset", plainText: `Click to reset: ${resetLink}` },
      recipients: { to: [{ address: user.email }] }
    };
    const poller = await emailClient.beginSend(message);
    await poller.pollUntilDone();
    res.json({ message: 'Password reset link sent!' });
  } catch {
    res.status(500).json({ message: 'Error sending reset email.' });
  }
});

// --- RESET PASSWORD ---
app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    const pool = await sql.connect(dbConnectionString);
    const userResult = await pool.request()
      .query`SELECT * FROM Users WHERE resetToken = ${token} AND resetTokenExpiry > GETDATE()`;
    if (userResult.recordset.length === 0)
      return res.status(400).json({ message: 'Token invalid or expired.' });

    const user = userResult.recordset[0];
    await pool.request()
      .query`UPDATE Users SET password = ${password}, resetToken = NULL, resetTokenExpiry = NULL WHERE id = ${user.id}`;
    res.json({ message: 'Password updated successfully.' });
  } catch {
    res.status(500).json({ message: 'Error resetting password.' });
  }
});

// --- LEARN REQUESTS ---
app.post('/api/learn', async (req, res) => {
  try {
    const { topic, fileName, requestedByUsername } = req.body;
    const pool = await sql.connect(dbConnectionString);
    await pool.request()
      .query`INSERT INTO LearnRequests (topic, fileName, requestedByUsername) VALUES (${topic}, ${fileName}, ${requestedByUsername})`;
    res.status(201).json({ message: 'Learn request added.' });
  } catch {
    res.status(500).json({ message: 'Error adding learn request.' });
  }
});

app.get('/api/learn', async (req, res) => {
  try {
    const pool = await sql.connect(dbConnectionString);
    const username = req.query.username;
    const query = username
      ? `SELECT * FROM LearnRequests WHERE requestedByUsername = '${username}'`
      : `SELECT * FROM LearnRequests`;
    const result = await pool.request().query(query);
    res.json(result.recordset);
  } catch {
    res.status(500).json({ message: 'Error fetching learn requests.' });
  }
});

// --- TUTOR OFFERS ---
app.post('/api/tutor', async (req, res) => {
  try {
    const { name, number, schedule } = req.body;
    const pool = await sql.connect(dbConnectionString);
    await pool.request()
      .query`INSERT INTO TutorOffers (name, number, schedule) VALUES (${name}, ${number}, ${schedule})`;
    res.status(201).json({ message: 'Tutor offer added.' });
  } catch {
    res.status(500).json({ message: 'Error adding tutor offer.' });
  }
});

app.get('/api/tutor', async (req, res) => {
  try {
    const pool = await sql.connect(dbConnectionString);
    const result = await pool.request().query`SELECT * FROM TutorOffers`;
    res.json(result.recordset);
  } catch {
    res.status(500).json({ message: 'Error fetching tutor offers.' });
  }
});

// --- PROPOSALS ---
app.post('/api/proposals', async (req, res) => {
  try {
    const { proposerUsername, recipientUsername, topic, proposedDate, proposedTime } = req.body;
    const pool = await sql.connect(dbConnectionString);
    await pool.request().query`
      INSERT INTO Proposals (proposerUsername, recipientUsername, topic, proposedDate, proposedTime, status, lastUpdated)
      VALUES (${proposerUsername}, ${recipientUsername}, ${topic}, ${proposedDate}, ${proposedTime}, 'pending', GETDATE())`;
    res.status(201).json({ message: 'Proposal sent!' });
  } catch {
    res.status(500).json({ message: 'Error creating proposal.' });
  }
});

// --- RESPOND TO PROPOSAL ---
app.post('/api/proposals/:id/respond', async (req, res) => {
  try {
    const { response } = req.body; // 'accepted' or 'rejected'
    const pool = await sql.connect(dbConnectionString);
    await pool.request()
      .query`UPDATE Proposals SET status = ${response}, lastUpdated = GETDATE() WHERE id = ${req.params.id}`;
    res.json({ message: `Proposal ${response}.` });
  } catch {
    res.status(500).json({ message: 'Error responding to proposal.' });
  }
});

// --- POLLING FOR NEW PROPOSALS (STUDENT SIDE) ---
app.get('/api/notifications/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const pool = await sql.connect(dbConnectionString);
    const result = await pool.request()
      .query`SELECT TOP 1 * FROM Proposals WHERE recipientUsername = ${username} AND status = 'pending' ORDER BY id DESC`;
    if (result.recordset.length > 0) {
      const p = result.recordset[0];
      res.json({ type: 'newProposal', data: { id: p.id, tutorName: p.proposerUsername, topic: p.topic, date: p.proposedDate, time: p.proposedTime } });
    } else res.json({});
  } catch {
    res.status(500).json({ message: 'Error fetching notifications.' });
  }
});

// --- POLLING FOR RESPONSE UPDATES (TUTOR SIDE) ---
app.get('/api/updates/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const pool = await sql.connect(dbConnectionString);
    const result = await pool.request()
      .query`SELECT TOP 1 * FROM Proposals WHERE proposerUsername = ${username} AND status IN ('accepted','rejected') ORDER BY lastUpdated DESC`;
    if (result.recordset.length > 0) {
      const p = result.recordset[0];
      res.json({ type: 'proposalResponse', data: { id: p.id, studentName: p.recipientUsername, topic: p.topic, status: p.status } });
    } else res.json({});
  } catch {
    res.status(500).json({ message: 'Error fetching updates.' });
  }
});

// --- START SERVER ---
app.listen(port, async () => {
  console.log(`🚀 Server running on port ${port}`);
  await initializeDatabase();
});
