const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const USERS_FILE = path.join(__dirname, 'users.json');
const MSG_FILE = path.join(__dirname, 'messages.json');

function read(file, def) {
  if (!fs.existsSync(file)) return def;
  return JSON.parse(fs.readFileSync(file));
}

function write(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let users = read(USERS_FILE, {});
let messages = read(MSG_FILE, []);
let online = {};

io.on('connection', (socket) => {

  socket.on('register', async ({ username, password }) => {
    if (users[username]) return socket.emit('err', 'Đã tồn tại');

    const hash = await bcrypt.hash(password, 10);
    users[username] = { password: hash, private: {} };
    write(USERS_FILE, users);

    socket.emit('ok', 'Đăng ký OK');
  });

  socket.on('login', async ({ username, password }) => {
    if (!users[username]) return socket.emit('err', 'Không tồn tại');

    const ok = await bcrypt.compare(password, users[username].password);
    if (!ok) return socket.emit('err', 'Sai mật khẩu');

    socket.user = username;
    online[socket.id] = username;

    socket.emit('login', username);
    socket.emit('history', messages);
    io.emit('online', Object.values(online));
  });

  socket.on('msg', (text) => {
    if (!socket.user) return;

    const m = { from: socket.user, text, time: new Date().toLocaleTimeString() };
    messages.push(m);
    write(MSG_FILE, messages);

    io.emit('msg', m);
  });

  socket.on('pm', ({ to, text }) => {
    const m = { from: socket.user, to, text, time: new Date().toLocaleTimeString() };

    socket.emit('pm', m);

    for (let id in online) {
      if (online[id] === to) io.to(id).emit('pm', m);
    }
  });

  socket.on('logout', () => {
    delete online[socket.id];
    socket.user = null;
    socket.emit('logout');
    io.emit('online', Object.values(online));
  });

  socket.on('disconnect', () => {
    delete online[socket.id];
    io.emit('online', Object.values(online));
  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Chat chạy tại cổng ${PORT}`);
});