const socket = io();

let currentUser = null;
let currentChat = null; // username or group name
let isGroup = false;
let allUsers = [];
let allGroups = [];

function $(q) { return document.querySelector(q); }
function $$(q) { return [...document.querySelectorAll(q)]; }

// --- Login ---
$('#login-btn').onclick = async () => {
    const username = $('#username').value.trim();
    const password = $('#password').value;
    if (!username || !password) return;
    const resp = await fetch('/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await resp.json();
    if (data.success) {
        socket.emit('login', { username, password });
    } else {
        $('#login-error').innerText = "Invalid username or password!";
    }
};

socket.on('login_success', (data) => {
    currentUser = data.username;
    allUsers = data.users.filter(u => u !== currentUser);
    $('#login-screen').style.display = 'none';
    $('#chat-app').style.display = 'flex';
    renderUserList();
    renderGroupList();
    $('#chat-title').innerText = 'Select a user or group to start chatting!';
});

socket.on('login_failed', () => {
    $('#login-error').innerText = "Invalid username or password!";
});

// --- User/Group Sidebar ---
function renderUserList() {
    $('#user-list').innerHTML = '';
    allUsers.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        li.onclick = () => selectChat(user, false);
        if (currentChat === user && !isGroup) li.classList.add('active');
        $('#user-list').appendChild(li);
    });
}
function renderGroupList() {
    $('#group-list').innerHTML = '';
    allGroups.forEach(g => {
        const li = document.createElement('li');
        li.textContent = g;
        li.onclick = () => selectChat(g, true);
        if (currentChat === g && isGroup) li.classList.add('active');
        $('#group-list').appendChild(li);
    });
}
// --- Chat Selection ---
function selectChat(name, group) {
    currentChat = name;
    isGroup = group;
    $('#chat-title').innerText = group ? `Group: ${name}` : `Chat with ${name}`;
    $('#chat-window').innerHTML = '';
    $$('#user-list li').forEach(li => li.classList.toggle('active', li.textContent === name && !group));
    $$('#group-list li').forEach(li => li.classList.toggle('active', li.textContent === name && group));
}

// --- Sending messages ---
$('#chat-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!currentChat) return;
    const msg = $('#chat-input').value.trim();
    const fileInput = $('#file-upload');
    let fileUrl = null, fileName = null;
    if (fileInput.files.length) {
        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        const resp = await fetch('/upload', { method: 'POST', body: formData });
        const data = await resp.json();
        fileUrl = data.url;
        fileName = data.name;
        fileInput.value = '';
    }
    if (!msg && !fileUrl) return;
    socket.emit('send_message', {
        to: isGroup ? null : currentChat,
        message: msg,
        fileUrl, fileName,
        group: isGroup ? currentChat : null
    });
    $('#chat-input').value = '';
};

$('#upload-btn').onclick = () => $('#file-upload').click();

// --- Message receive ---
socket.on('message', (msg) => {
    let peer = msg.group || (msg.from === currentUser ? msg.to : msg.from);
    if (peer !== currentChat) return; // only show if current chat is selected
    const div = document.createElement('div');
    div.className = 'message' + (msg.from === currentUser ? ' own' : '');
    div.innerHTML = `
    <div class="meta">${msg.from} • ${new Date(msg.ts).toLocaleTimeString()}</div>
    <div>${msg.text || ''}</div>
    ${msg.fileUrl ? renderFileLink(msg.fileUrl, msg.fileName) : ''}
  `;
    $('#chat-window').appendChild(div);
    $('#chat-window').scrollTop = $('#chat-window').scrollHeight;
});

// --- User presence ---
socket.on('user_online', (user) => {
    if (!allUsers.includes(user) && user !== currentUser) {
        allUsers.push(user); renderUserList();
    }
});
socket.on('user_offline', (user) => {
    allUsers = allUsers.filter(u => u !== user); renderUserList();
});

// --- Groups ---
$('#create-group-btn').onclick = () => {
    $('#group-modal').style.display = 'block';
    $('#group-name').value = '';
    $('#group-users').innerHTML = '';
    allUsers.forEach(u => {
        $('#group-users').innerHTML += `<label><input type="checkbox" value="${u}"> ${u}</label>`;
    });
};
$('#close-group-modal').onclick = () => $('#group-modal').style.display = 'none';
$('#create-group-confirm').onclick = () => {
    const name = $('#group-name').value.trim();
    const users = Array.from($('#group-users').querySelectorAll('input:checked')).map(i => i.value);
    if (!name || users.length === 0) return;
    socket.emit('create_group', { groupName: name, users });
    $('#group-modal').style.display = 'none';
};
socket.on('group_created', ({ group, users }) => {
    if (!allGroups.includes(group)) {
        allGroups.push(group); renderGroupList();
    }
});

// --- File link helper ---
function renderFileLink(url, name) {
    const ext = name.split('.').pop().toLowerCase();
    if (['mp4', 'webm', 'ogg'].includes(ext)) {
        return `<video controls width="200" src="${url}"></video><br><a class="file-link" href="${url}" download>Download ${name}</a>`;
    }
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) {
        return `<img src="${url}" style="max-width:200px;max-height:120px;display:block;"><br><a class="file-link" href="${url}" download>Download ${name}</a>`;
    }
    return `<a class="file-link" href="${url}" download>${name}</a>`;
}