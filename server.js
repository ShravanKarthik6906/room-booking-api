const express = require('express');
require('dotenv').config({ quiet: true });

const app = express();

app.use(express.json());

// ----- Routes -----
app.use('/api/health', require('./routes/health'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/spaces', require('./routes/rooms'));

app.get('/', (req, res) => {
  res.json({ message: 'On-Campus Room Booking API. See /api/health' });
});

// ----- 404 for unknown routes -----
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ----- Global error handler -----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Body was not valid JSON
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON in request body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Only start listening when run directly (not when imported by tests)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
