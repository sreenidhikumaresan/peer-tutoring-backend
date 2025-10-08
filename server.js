const express = require('express');
const cors = require('cors');
const sql = require('mssql');
const crypto = require('crypto');
const { EmailClient } = require("@azure/communication-email");
const { WebPubSubServiceClient } = require('@azure/web-pubsub');

const app = express();
const port = process.env.PORT || 8080;

// --- CONNECTION STRINGS ---
const dbConnectionString = 'Server=tcp:pse10-sql-server-new.database.windows.net,1433;Initial Catalog=pse10-db;Persist Security Info=False;User ID=sqladmin;Password=Project@1;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;';
const pubSubConnectionString = process.env.WEB_PUBSUB_CONNECTION_STRING;
const hubName = 'tutorHub';

// Initialize clients
const pubSubClient = new WebPubSubServiceClient(pubSubConnectionString, hubName);

// Middleware
app.use(cors());
app.use(express.json());

// --- DATABASE INITIALIZATION ---
async function initializeDatabase() {
  try {
    const pool = await sql.connect(dbConnectionString);
    const request = pool.request();
    // Ensure all tables and columns exist
    await request.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' and xtype='U') CREATE TABLE Users (id INT PRIMARY KEY IDENTITY(1,1), name NVARCHAR(255) NOT NULL, username NVARCHAR(50) UNIQUE NOT NULL, email NVARCHAR(255) UNIQUE, password NVARCHAR(255) NOT NULL, resetToken NVARCHAR(255), resetTokenExpiry DATETIME);
      IF COL_LENGTH('Users', 'email') IS NULL ALTER TABLE Users ADD email NVARCHAR(255) UNIQUE;
      IF COL_LENGTH('Users', 'resetToken') IS NULL ALTER TABLE Users ADD resetToken NVARCHAR(255);
      IF COL_LENGTH('Users', 'resetTokenExpiry') IS NULL ALTER TABLE Users ADD resetTokenExpiry DATETIME;
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TutorOffers' and xtype='U') CREATE TABLE TutorOffers (id INT PRIMARY KEY IDENTITY(1,1), name NVARCHAR(255) NOT NULL, number NVARCHAR(50), schedule NVARCHAR(255));
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='LearnRequests' and xtype='U') CREATE TABLE LearnRequests (id INT PRIMARY KEY IDENTITY(1,1), topic NVARCHAR(255) NOT NULL, fileName NVARCHAR(255), requestedByUsername NVARCHAR(255));
      IF COL_LENGTH('LearnRequests', 'requestedByUsername') IS NULL ALTER TABLE LearnRequests ADD requestedByUsername NVARCHAR(255);
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Proposals' and xtype='U') CREATE TABLE Proposals (id INT PRIMARY KEY IDENTITY(1,1), proposerUsername NVARCHAR(255), recipientUsername NVARCHAR(255), topic NVARCHAR(255), proposedDate DATE, proposedTime TIME, status NVARCHAR(50) DEFAULT 'pending');
    `);
    console.log('Database schema is up to date.');
  } catch (err) {
    console.error('FATAL: Database initialization failed:', err);
    process.exit(1);
  }
}

// --- STANDARD API ROUTES ---
app.get('/api/test', (req, res) => res.json({ message: 'Hello from the backend API!' }));

app.post('/api/signup', async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    if (!name || !username || !email || !password) return res.status(400).json({ message: 'All fields are required.' });
    const pool = await sql.connect(dbConnectionString);
    await pool.request().query`INSERT INTO Users (name, username, email, password) VALUES (${name}, ${username}, ${email}, ${password})`;
    res.status(201).json({ message: 'User created successfully!' });
  } catch (err) {
    if (err.number === 2627) return res.status(409).json({ message: 'Username or email already exists.' });
    console.error('Signup Error:', err);
    res.status(500).json({ message: 'Error creating user.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username and password are required.' });
    const pool = await sql.connect(dbConnectionString);
    const result = await pool.request().query`SELECT * FROM Users WHERE username = ${username} AND password = ${password}`;
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

app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const pool = await sql.connect(dbConnectionString);
    const userResult = await pool.request().query`SELECT * FROM Users WHERE email = ${email}`;
    if (userResult.recordset.length > 0) {
      const user = userResult.recordset[0];
      const token = crypto.randomBytes(20).toString('hex');
      const expiry = new Date(Date.now() + 3600000);
      await pool.request().query`UPDATE Users SET resetToken = ${token}, resetTokenExpiry = ${expiry} WHERE email = ${email}`;
      const frontendUrl = "https://pse10-frontend-site-ffgrdtdvfveec0du.centralindia-01.azurewebsites.net";
      const resetLink = `${frontendUrl}/reset-password.html?token=${token}`;
      const connectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
      const senderAddress = process.env.SENDER_EMAIL_ADDRESS;
      const emailClient = new EmailClient(connectionString);
      const message = { senderAddress, content: { subject: "Password Reset for Peer Tutoring", plainText: `Click the link to reset: ${resetLink}` }, recipients: { to: [{ address: user.email }] } };
      const poller = await emailClient.beginSend(message);
      await poller.pollUntilDone();
      console.log(`Password reset email sent to ${user.email}`);
    }
    res.json({ message: 'If an account with that email exists, a link has been sent.' });
  } catch (err) {
    console.error('Forgot Password Error:', err);
    res.status(500).json({ message: 'Error sending reset email.' });
  }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    const pool = await sql.connect(dbConnectionString);
    const userResult = await pool.request().query`SELECT * FROM Users WHERE resetToken = ${token} AND resetTokenExpiry > GETDATE()`;
    if (userResult.recordset.length === 0) return res.status(400).json({ message: 'Token is invalid or has expired.' });
    const user = userResult.recordset[0];
    await pool.request().query`UPDATE Users SET password = ${password}, resetToken = NULL, resetTokenExpiry = NULL WHERE id = ${user.id}`;
    res.json({ message: 'Password has been updated.' });
  } catch (err) {
    console.error('Reset Password Error:', err);
    res.status(500).json({ message: 'Error resetting password.' });
  }
});

app.post('/api/learn', async (req, res) => {
  try {
    const { topic, fileName, requestedByUsername } = req.body;
    if (!topic || !fileName || !requestedByUsername) return res.status(400).json({ message: 'Missing required fields.' });
    const pool = await sql.connect(dbConnectionString);
    await pool.request().query`INSERT INTO LearnRequests (topic, fileName, requestedByUsername) VALUES (${topic}, ${fileName}, ${requestedByUsername})`;
    res.status(201).json({ message: 'Learn request added.' });
  } catch (err) { res.status(500).json({ message: 'Error adding learn request.' }) }
});

app.get('/api/learn', async (req, res) => {
  try {
    const pool = await sql.connect(dbConnectionString);
    const username = req.query.username;
    let result;
    if (username) {
      result = await pool.request().query`SELECT * FROM LearnRequests WHERE requestedByUsername = ${username}`;
    } else {
      result = await pool.request().query`SELECT * FROM LearnRequests`;
    }
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: 'Error fetching learn requests.' }) }
});

app.post('/api/tutor', async (req, res) => {
  try {
    const { name, number, schedule } = req.body;
    const pool = await sql.connect(dbConnectionString);
    await pool.request().query`INSERT INTO TutorOffers (name, number, schedule) VALUES (${name}, ${number}, ${schedule})`;
    res.status(201).json({ message: 'Tutor offer added.' });
  } catch (err) { res.status(500).json({ message: 'Error adding tutor offer.' }) }
});

app.get('/api/tutor', async (req, res) => {
  try {
    const pool = await sql.connect(dbConnectionString);
    const result = await pool.request().query`SELECT * FROM TutorOffers`;
    res.json(result.recordset);
  } catch (err) { res.status(500).json({ message: 'Error fetching tutor offers.' }) }
});


// --- REAL-TIME NOTIFICATION ROUTES ---
app.get('/negotiate', async (req, res) => {
  const username = req.query.username;
  if (!username) return res.status(400).send('Missing username.');
  try {
    const token = await pubSubClient.getClientAccessToken({ userId: username });
    res.json({ url: token.url });
  } catch (err) {
    console.error("Error getting client access token:", err);
    res.status(500).json({ message: "Error getting access token." });
  }
});

app.post('/api/proposals', async (req, res) => {
  try {
    const { proposerUsername, recipientUsername, topic, proposedDate, proposedTime } = req.body;
    const pool = await sql.connect(dbConnectionString);
    const result = await pool.request().query`INSERT INTO Proposals (proposerUsername, recipientUsername, topic, proposedDate, proposedTime, status) OUTPUT INSERTED.id VALUES (${proposerUsername}, ${recipientUsername}, ${topic}, ${proposedDate}, ${proposedTime}, 'pending')`;
    const newProposalId = result.recordset[0].id;

    await pubSubClient.sendToUser(recipientUsername, {
      type: 'newProposal',
      data: { id: newProposalId, tutorName: proposerUsername, tutorPoints: 10, date: proposedDate, time: proposedTime, topic: topic }
    });
    res.status(201).json({ message: 'Proposal sent!' });
  } catch (err) {
    console.error('Error creating proposal:', err);
    res.status(500).json({ message: 'Error creating proposal.' });
  }
});

app.post('/api/proposals/:id/respond', async (req, res) => {
  try {
    const { response } = req.body; // 'accepted' or 'rejected'
    const pool = await sql.connect(dbConnectionString);
    await pool.request().query`UPDATE Proposals SET status = ${response} WHERE id = ${req.params.id}`;
    const proposalResult = await pool.request().query`SELECT * FROM Proposals WHERE id = ${req.params.id}`;
    const proposal = proposalResult.recordset[0];
    
    await pubSubClient.sendToUser(proposal.proposerUsername, {
      type: 'proposalResponse',
      data: { topic: proposal.topic, status: response, recipient: proposal.recipientUsername }
    });
    res.json({ message: `Proposal ${response}.` });
  } catch (err) {
    console.error('Error responding to proposal:', err);
    res.status(500).json({ message: 'Error responding.' });
  }
});

// --- START SERVER ---
app.listen(port, async () => {
  console.log(`Server is starting and listening on port ${port}`);
  await initializeDatabase();
});