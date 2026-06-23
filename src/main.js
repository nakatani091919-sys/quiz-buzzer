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
      <div class="row">
        <label>正解時の点数</label>
        <input id="correctPoint" type="number" value="10" />
      </div>

      <div class="row">
        <label>不正解時の点数</label>
        <input id="wrongPoint" type="number" value="-5" />
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
      <h3>得点</h3>
      <ul id="scoreList"></ul>
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
      <p id="myScore">現在の得点：0点</p>
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

const scoreList = document.getElementById('scoreList');
const myScore = document.getElementById('myScore');

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

    const players = room.players || {};

    scoreList.innerHTML = '';

  Object.entries(players)
    .map(([id, player]) => ({
      playerId: id,
      name: player.name,
      score: player.score ?? 0
    }))
    .sort((a, b) => b.score - a.score)
    .forEach((player) => {
      const li = document.createElement('li');
      li.textContent = `${player.name}: ${player.score}点`;
      scoreList.appendChild(li);
    });

  const me = players[playerId];
  if (me) {
    myScore.textContent = `現在の得点：${me.score ?? 0}点`;
  }

    const buzzes = room.buzzes || {};

  const sortedBuzzes = Object.entries(buzzes)
  .map(([id, value]) => ({
    playerId: id,
    name: value.name,
    timestamp: value.timestamp ?? 0
  }))
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
function getSortedBuzzes(room) {
  const buzzes = room.buzzes || {};

  return Object.entries(buzzes)
    .map(([id, value]) => ({
      playerId: id,
      name: value.name,
      timestamp: value.timestamp ?? 0
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}
async function addScore(roomId, targetPlayerId, point) {
  const playerRef = ref(db, `rooms/${roomId}/players/${targetPlayerId}`);
  const snapshot = await get(playerRef);
  const player = snapshot.val();

  if (!player) {
    alert('対象のプレイヤーが見つかりません');
    return;
  }

  const currentScore = player.score ?? 0;

  await update(playerRef, {
    score: currentScore + point
  });
}

function getCurrentAnswerer(room) {
  const sortedBuzzes = getSortedBuzzes(room);
  const currentIndex = room.currentIndex ?? 0;
  return sortedBuzzes[currentIndex] || null;
}
function getPointSettingsFromInput() {
  const correctPoint = Number(document.getElementById('correctPoint').value);
  const wrongPoint = Number(document.getElementById('wrongPoint').value);

  return {
    correctPoint: Number.isFinite(correctPoint) ? correctPoint : 10,
    wrongPoint: Number.isFinite(wrongPoint) ? wrongPoint : -5
  };
}

// 出題者：部屋作成
document.getElementById('createRoom').addEventListener('click', async () => {
  const roomId = document.getElementById('hostRoomId').value.trim();

  if (!roomId) {
    alert('部屋番号を入力してください');
    return;
  }

  currentRoomId = roomId;

  const pointSettings = getPointSettingsFromInput();

await set(ref(db, `rooms/${roomId}`), {
  status: 'waiting',
  currentIndex: 0,
  settings: pointSettings,
  players: {},
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

   await update(ref(db, `rooms/${roomId}`), {
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
 const ok = confirm('この部屋をリセットしますか？\n得点状態が初期化されます。');

  if (!ok) {
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

  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  const room = snapshot.val();

  if (!room) {
    alert('部屋が見つかりません');
    return;
  }

  const answerer = getCurrentAnswerer(room);

  if (!answerer) {
    alert('現在の回答者がいません');
    return;
  }

  const correctPoint = room.settings?.correctPoint ?? 10;

  await addScore(roomId, answerer.playerId, correctPoint);

  // 正解したら、その問題の受付を終了する
  await update(roomRef, {
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

  if (!room) {
    alert('部屋が見つかりません');
    return;
  }

  const answerer = getCurrentAnswerer(room);

  if (!answerer) {
    alert('現在の回答者がいません');
    return;
  }

  const wrongPoint = room.settings?.wrongPoint ?? -5;
  await addScore(roomId, answerer.playerId, wrongPoint);

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