require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./backend/routes/auth');
const coursesRoutes = require('./backend/routes/courses');
const assignmentsRoutes = require('./backend/routes/assignments');
const submissionsRoutes = require('./backend/routes/submissions');
const materialsRoutes = require('./backend/routes/materials');
const adminRoutes = require('./backend/routes/admin');
const notificationsRoutes = require('./backend/routes/notifications');

const app = express();

const uploadsRoot = path.join(__dirname, 'uploads');
const materialsDir = path.join(uploadsRoot, 'materials');
const submissionsDir = path.join(uploadsRoot, 'submissions');
const assignmentsDir = path.join(uploadsRoot, 'assignments');

[materialsDir, submissionsDir, assignmentsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

app.use(
  cors({
    origin: true,
    credentials: false,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(uploadsRoot));

app.use('/api/auth', authRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/assignments', assignmentsRoutes);
app.use('/api/submissions', submissionsRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationsRoutes);

app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/images', express.static(path.join(__dirname, 'images')));

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'damanhour-science-platform' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).send('Not found');
});

const PORT = Number(process.env.PORT || 3000);

app.listen(PORT, () => {
  console.log(`Faculty platform listening on http://localhost:${PORT}`);
});
