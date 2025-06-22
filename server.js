const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Hardcoded users: { username: password }
const USERS = {
    "ali": "abbas",
    "muddassir": "abbas786"
};

const GROUPS = {}; // { groupName: [usernames] }
const userSockets = {}; // { username: socket.id }

app.use(express.static('public'));
app.use(express.json());

// --- File uploads setup ---
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send("No file uploaded.");
    res.json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname });
});

// --- Auth API ---
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (USERS[username] && USERS[username] === password) {
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'Invalid credentials' });
    }
});

http.listen(3000, () => console.log('Server running on http://localhost:3000'));

// --- Socket.io Logic ---
io.on('connection', (socket) => {
    let username = null;

    socket.on('login', (data) => {
        if (USERS[data.username] && USERS[data.username] === data.password) {
            username = data.username;
            userSockets[username] = socket.id;
            socket.emit('login_success', { username, users: Object.keys(USERS) });
            socket.broadcast.emit('user_online', username);
        } else {
            socket.emit('login_failed');
        }
    });

    socket.on('send_message', (data) => {
        // data: {to, message, fileUrl, fileName, group}
        const msg = {
            from: username,
            text: data.message,
            fileUrl: data.fileUrl,
            fileName: data.fileName,
            ts: Date.now()
        };
        if (data.group) {
            if (!GROUPS[data.group]) return;
            GROUPS[data.group].forEach(u => {
                if (userSockets[u]) io.to(userSockets[u]).emit('message', { ...msg, group: data.group });
            });
        } else {
            if (userSockets[data.to]) io.to(userSockets[data.to]).emit('message', msg);
            socket.emit('message', { ...msg, to: data.to });
        }
    });

    socket.on('create_group', (data) => {
        // data: {groupName, users: [username]}
        if (!GROUPS[data.groupName]) {
            GROUPS[data.groupName] = data.users.filter(u => USERS[u]);
            GROUPS[data.groupName].push(username);
            GROUPS[data.groupName] = [...new Set(GROUPS[data.groupName])];
            GROUPS[data.groupName].forEach(u => {
                if (userSockets[u]) io.to(userSockets[u]).emit('group_created', { group: data.groupName, users: GROUPS[data.groupName] });
            });
        }
    });

    socket.on('disconnect', () => {
        if (username) {
            delete userSockets[username];
            socket.broadcast.emit('user_offline', username);
        }
    });
});