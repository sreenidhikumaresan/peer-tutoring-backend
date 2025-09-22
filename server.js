const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json()); // This is important to parse JSON request bodies

// In-memory "database" to store requests and offers
let learnRequests = [];
let tutorOffers = [];

// API Routes
app.get('/api/test', (req, res) => {
  res.json({ message: 'Hello from the backend API!' });
});

// --- NEW ROUTES FOR LEARN REQUESTS ---
app.post('/api/learn', (req, res) => {
  const newRequest = req.body;
  newRequest.id = learnRequests.length + 1; // simple id
  learnRequests.push(newRequest);
  console.log('Added learn request:', newRequest);
  res.status(201).json({ message: 'Learn request added successfully!', data: newRequest });
});

app.get('/api/learn', (req, res) => {
  res.json(learnRequests);
});

// --- NEW ROUTES FOR TUTOR OFFERS ---
app.post('/api/tutor', (req, res) => {
  const newOffer = req.body;
  newOffer.id = tutorOffers.length + 1; // simple id
  tutorOffers.push(newOffer);
  console.log('Added tutor offer:', newOffer);
  res.status(201).json({ message: 'Tutor offer added successfully!', data: newOffer });
});

app.get('/api/tutor', (req, res) => {
  res.json(tutorOffers);
});

// Start the server
app.listen(port, () => {
  console.log(`Backend server is listening on port ${port}`);
}); 