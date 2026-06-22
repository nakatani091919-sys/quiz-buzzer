import './style.css';

import { initializeApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  serverTimestamp,
  get
} from 'firebase/database';

// ここを自分のFirebase設定に置き換える
const firebaseConfig = {
  apiKey: "AIzaSyCbk8fKpZjY_WXuwhGfrxPj3BBOh1EgmzY",
  authDomain: "hayaoshi-c1178.firebaseapp.com",
  projectId: "hayaoshi-c1178",
  databaseURL: "https://hayaoshi-c1178-default-rtdb.asia-southeast1.firebasedatabase.app",
  storageBucket: "hayaoshi-c1178.firebasestorage.app",
  messagingSenderId: "96358205739",
  appId: "1:96358205739:web:1dffa465005c05d347dd6e"

};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// 参加者ごとのIDをブラウザに保存する
let playerId = localStorage.getItem('playerId');
if (!playerId) {
  playerId = crypto.randomUUID();
  localStorage.setItem('playerId', playerId);
}

let currentRoomId = '';
let currentPlayerName = '';

document.querySelector('#app').innerHTML = `
  <main class="container">
    <h1>早押しツール</h1>

    <section class="card">
      <h2>モード選択</h2>
      <button id="showHost">出題者モード</button>
      <button id="showPlayer">回答者モード</button>
    </section>

    <section id="hostArea" class="card hidden">
      <h2>出題者側</h2>

      <div class="row">
        <label>部屋番号</label>
        <input id="hostRoomId" placeholder="例: 1234" />
      </div>

      <button id="createRoom">部屋作成</button>
      <button id="startQuestion">問題開始</button>
      <button id="closeQuestion">受付停止</button>
      <button id="resetRoom">リセット</button>

      <h3>現在の状態</h3>
      <p id="hostStatus">未接続</p>

      <h3>現在の回答者</h3>
      <p id="currentAnswerer">なし</p>

      <h3>早押し順</h3>
      <ol id="buzzList"></ol>

      <div class="judgeButtons">
        <button id="correct">正解</button>
        <button id="wrong">不正解・次の人へ</button>
      </div>
    </section>

    <section id="playerArea" class="card hidden">
      <h2>回答者側</h2>

      <div class="row">
        <label>部屋番号</label>
        <input id="playerRoomId" placeholder="例: 1234" />
      </div>

      <div class="row">
        <label>名前</label>
        <input id="playerName" placeholder="例: 山田" />
      </div>

      <button id="joinRoom">入室</button>

      <h3>現在の状態</h3>
      <p id="playerStatus">未接続</p>

      <button id="buzzButton" class="buzz" disabled>早押し！</button>

      <p id="playerMessage"></p>
    </section>
  </main>
`;

const hostArea = document.getElementById('hostArea');
const playerArea = document.getElementById('playerArea');

const hostStatus = document.getElementById('hostStatus');
const currentAnswerer = document.getElementById('currentAnswerer');
const buzzList = document.getElementById('buzzList');

const playerStatus = document.getElementById('playerStatus');
const playerMessage = document.getElementById('playerMessage');
const buzzButton = document.getElementById('buzzButton');

document.getElementById('showHost').addEventListener('click', () => {
  hostArea.classList.remove('hidden');
  playerArea.classList.add('hidden');
});

document.getElementById('showPlayer').addEventListener('click', () => {
  playerArea.classList.remove('hidden');
  hostArea.classList.add('hidden');
});

// 部屋データを監視する
function watchRoom(roomId) {
  const roomRef = ref(db, `rooms/${roomId}`);

  onValue(roomRef, (snapshot) => {
    const room = snapshot.val();

    if (!room) {
      hostStatus.textContent = '部屋がありません';
      playerStatus.textContent = '部屋がありません';
      buzzButton.disabled = true;
      return;
    }

    const statusText = convertStatus(room.status);

    hostStatus.textContent = statusText;
    playerStatus.textContent = statusText;

    const buzzes = room.buzzes || {};
    const sortedBuzzes = Object.entries(buzzes)
      .map(([id, value]) => ({
        playerId: id,
        name: value.name,
        timestamp: value.timestamp
      }))
      .filter((buzz) => typeof buzz.timestamp === 'number')
      .sort((a, b) => a.timestamp - b.timestamp);

    buzzList.innerHTML = '';

    sortedBuzzes.forEach((buzz, index) => {
      const li = document.createElement('li');
      li.textContent = `${buzz.name}`;
      buzzList.appendChild(li);

      if (buzz.playerId === playerId) {
        playerMessage.textContent = `あなたは ${index + 1} 番目です`;
      }
    });

    const currentIndex = room.currentIndex ?? 0;
    const answerer = sortedBuzzes[currentIndex];

    if (answerer) {
      currentAnswerer.textContent = answerer.name;
    } else {
      currentAnswerer.textContent = 'なし';
    }

    if (room.status === 'open') {
      buzzButton.disabled = false;
    } else {
      buzzButton.disabled = true;
    }

    if (room.status === 'waiting') {
      playerMessage.textContent = '問題開始を待っています';
    }

    if (room.status === 'closed') {
      playerMessage.textContent = 'この問題は終了しました';
    }
  });
}

function convertStatus(status) {
  switch (status) {
    case 'waiting':
      return '待機中';
    case 'open':
      return '早押し受付中';
    case 'closed':
      return '問題終了';
    default:
      return '不明';
  }
}

// 出題者：部屋作成
document.getElementById('createRoom').addEventListener('click', async () => {
  const roomId = document.getElementById('hostRoomId').value.trim();

  if (!roomId) {
    alert('部屋番号を入力してください');
    return;
  }

  currentRoomId = roomId;

  await set(ref(db, `rooms/${roomId}`), {
    status: 'waiting',
    currentIndex: 0,
    buzzes: {}
  });

  watchRoom(roomId);
});

// 出題者：問題開始
document.getElementById('startQuestion').addEventListener('click', async () => {
  const roomId = document.getElementById('hostRoomId').value.trim();

  if (!roomId) {
    alert('部屋番号を入力してください');
    return;
  }

  currentRoomId = roomId;

  await set(ref(db, `rooms/${roomId}`), {
    status: 'open',
    currentIndex: 0,
    buzzes: {}
  });

  watchRoom(roomId);
});

// 出題者：受付停止
document.getElementById('closeQuestion').addEventListener('click', async () => {
  const roomId = document.getElementById('hostRoomId').value.trim();

  if (!roomId) {
    alert('部屋番号を入力してください');
    return;
  }

  await update(ref(db, `rooms/${roomId}`), {
    status: 'closed'
  });
});

// 出題者：リセット
document.getElementById('resetRoom').addEventListener('click', async () => {
  const roomId = document.getElementById('hostRoomId').value.trim();

  if (!roomId) {
    alert('部屋番号を入力してください');
    return;
  }

  await set(ref(db, `rooms/${roomId}`), {
    status: 'waiting',
    currentIndex: 0,
    buzzes: {}
  });
});

// 出題者：正解
document.getElementById('correct').addEventListener('click', async () => {
  const roomId = document.getElementById('hostRoomId').value.trim();

  if (!roomId) {
    alert('部屋番号を入力してください');
    return;
  }

  await update(ref(db, `rooms/${roomId}`), {
    status: 'closed'
  });
});

// 出題者：不正解・次の人へ
document.getElementById('wrong').addEventListener('click', async () => {
  const roomId = document.getElementById('hostRoomId').value.trim();

  if (!roomId) {
    alert('部屋番号を入力してください');
    return;
  }

  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  const room = snapshot.val();

  if (!room) return;

  const currentIndex = room.currentIndex ?? 0;

  await update(roomRef, {
    currentIndex: currentIndex + 1
  });
});

// 回答者：入室
document.getElementById('joinRoom').addEventListener('click', async () => {
  const roomId = document.getElementById('playerRoomId').value.trim();
  const name = document.getElementById('playerName').value.trim();

  if (!roomId || !name) {
    alert('部屋番号と名前を入力してください');
    return;
  }

  currentRoomId = roomId;
  currentPlayerName = name;

  await set(ref(db, `rooms/${roomId}/players/${playerId}`), {
    name
  });

  watchRoom(roomId);

  playerMessage.textContent = '入室しました';
});

// 回答者：早押し
document.getElementById('buzzButton').addEventListener('click', async () => {
  const roomId = document.getElementById('playerRoomId').value.trim();
  const name = document.getElementById('playerName').value.trim();

  if (!roomId || !name) {
    alert('部屋番号と名前を入力してください');
    return;
  }

  // 連打防止
  buzzButton.disabled = true;

  await set(ref(db, `rooms/${roomId}/buzzes/${playerId}`), {
    name,
    timestamp: serverTimestamp()
  });

  playerMessage.textContent = '押しました';
});