require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const { notFound, errorHandler } = require('./middleware/errorHandler');

const departmentRoutes = require('./routes/departments');
const patientRoutes = require('./routes/patients');
const ticketRoutes = require('./routes/tickets');
const facilitatorRoutes = require('./routes/facilitators');
const triageNurseRoutes = require('./routes/triageNurses');
const receptionistRoutes = require('./routes/receptionists');
const serviceRoutes = require('./routes/services');
const notificationRoutes = require('./routes/notifications');
const reportRoutes = require('./routes/reports');
const administratorRoutes = require('./routes/administrators');
const serviceAssignmentRoutes = require('./routes/serviceAssignment');

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

app.use('/api/departments', departmentRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/facilitators', facilitatorRoutes);
app.use('/api/triage-nurses', triageNurseRoutes);
app.use('/api/receptionists', receptionistRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/administrators', administratorRoutes);
app.use('/api/service-assignments', serviceAssignmentRoutes);

// Still to come: service-assignments (the junction table linking
// facilitator/nurse/service together for a given visit).

// Must be registered after every route above: notFound catches anything
// that didn't match, errorHandler turns thrown ApiErrors and Prisma
// error codes (P2002/P2025/P2003) into proper status codes instead of
// generic 500s.
app.use(notFound);
app.use(errorHandler);

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