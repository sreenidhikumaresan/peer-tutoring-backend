const express = require('express');
const cors = require('cors'); // 1. Add this line
const app = express();
const port = process.env.PORT || 5000;

app.use(cors()); // 2. And add this line

// A simple test route to confirm the API is working
app.get('/api/test', (req, res) => {
  res.json({ message: 'Hello from the backend API!' });
});

app.listen(port, () => {
  console.log(`Backend server is listening on port ${port}`);
});