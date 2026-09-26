require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const ticketRoutes = require('./routes/tickets');
const triageRoutes = require('./routes/triage');
const serviceRoutes = require('./routes/services');
const authRoutes = require('./routes/auth');
const serviceTypeRoutes = require('./routes/serviceTypes');
const facilitatorRoutes = require('./routes/facilitators');
const { facilitator } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Make io available to route handlers via req.app.get('io')
app.set('io', io);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/tickets', ticketRoutes);
app.use('/api/triage', triageRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/service-types', serviceTypeRoutes);
app.use('/api/facilitators', facilitatorRoutes);

io.on('connection', (socket) => {
  console.log('Dashboard client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Dashboard client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
