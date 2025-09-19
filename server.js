const express = require('express');
const app = express();
const port = process.env.PORT || 5000;

// A simple test route to make sure the server is working
app.get('/api/test', (req, res) => {
  res.json({ message: 'Hello from the backend!' });
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});