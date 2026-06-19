const todoInput = document.getElementById("todoInput");
const dueInput = document.getElementById("dueInput");
const notifyInput = document.getElementById("notifyInput");
const addButton = document.getElementById("addButton");
const todoList = document.getElementById("todoList");
const enableNotifyButton = document.getElementById("enableNotifyButton");
const dueFieldPlaceholder = document.querySelector(".due-field-placeholder");

const updateDuePlaceholder = () => {
  if (!dueFieldPlaceholder) {
    return;
  }
  dueFieldPlaceholder.classList.toggle("hidden", dueInput.value !== "");
};

dueInput.addEventListener("input", updateDuePlaceholder);
dueInput.addEventListener("change", updateDuePlaceholder);
updateDuePlaceholder();

const INSTALL_BANNER_DISMISSED_KEY = "installBannerDismissed";

const isStandaloneApp = () =>
  window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;

const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

const setupInstallBanner = () => {
  const banner = document.getElementById("installBanner");
  const closeButton = document.getElementById("installBannerClose");
  if (!banner || !closeButton) {
    return;
  }

  if (isStandaloneApp() || !isIos() || localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY) === "1") {
    return;
  }

  banner.hidden = false;
  closeButton.addEventListener("click", () => {
    banner.hidden = true;
    localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, "1");
  });
};

setupInstallBanner();

const STORAGE_KEY = "todoItems";
const ALERT_CHECK_INTERVAL_MS = 60 * 1000;
const alertedTodoIds = new Set();

const NOTIFY_OFFSET_MS = {
  "1h": 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "3h": 3 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

const NOTIFY_LABELS = {
  "1h": "1時間前",
  "2h": "2時間前",
  "3h": "3時間前",
  "1d": "1日前",
  daily: "毎日",
};

const getNotifyMode = (todo) => todo.notify || "1h";

// Fill these in after deploying the Cloudflare Worker (see worker/README setup steps):
// WORKER_URL: the *.workers.dev URL printed by `wrangler deploy`.
// VAPID_PUBLIC_KEY: the public key from `npx web-push generate-vapid-keys`.
const WORKER_URL = "https://todo-push-worker.s-mahiro080419.workers.dev";
const VAPID_PUBLIC_KEY = "BLqjIEfKgEnDx-FPRx-jYF1JPboUX0DfP4MO6w6o4D3A7RvUgdiayITF3VGE_slVipsz_VIB0ibOxroKwxIIzJ8";

const isPushConfigured = () =>
  !WORKER_URL.includes("YOUR-SUBDOMAIN") && !VAPID_PUBLIC_KEY.startsWith("REPLACE_WITH");

const getClientId = () => {
  let id = localStorage.getItem("clientId");
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem("clientId", id);
  }
  return id;
};

const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

const toUtcIso = (dueTime) => {
  if (!dueTime) {
    return null;
  }
  const date = new Date(dueTime);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const syncTodosToServer = (todos) => {
  if (!isPushConfigured()) {
    return;
  }
  const todosForServer = todos.map((todo) => ({ ...todo, dueTime: toUtcIso(todo.dueTime) }));
  fetch(`${WORKER_URL}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: getClientId(), todos: todosForServer }),
  }).catch(() => {});
};

const registerPushSubscription = async () => {
  if (!isPushConfigured() || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.register("sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return false;
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const response = await fetch(`${WORKER_URL}/api/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: getClientId(), subscription }),
    });
    return response.ok;
  } catch (err) {
    console.error("push subscription failed", err);
    return false;
  }
};

const ensureNotificationPermission = () => {
  if (!("Notification" in window)) {
    return;
  }
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
};

const sendNotice = (title, body) => {
  playNoticeSound();
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
    return;
  }
  alert(`${title}\n${body}`);
};

const NOTICE_BEEP_COUNT = 3;
const NOTICE_BEEP_INTERVAL_MS = 450;

const playNoticeSound = () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    return;
  }
  const context = new AudioContext();

  const beep = () => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.14, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.35);
  };

  for (let i = 0; i < NOTICE_BEEP_COUNT; i += 1) {
    setTimeout(beep, i * NOTICE_BEEP_INTERVAL_MS);
  }
};

const loadTodos = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
};

const saveTodos = (todos) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  syncTodosToServer(todos);
};

const formatTodoTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).replace(/\//g, "-");
};

const getTodoKey = (todo) => `${todo.text}::${todo.dueTime}`;

const isDueSoon = (todo) => {
  if (!todo.dueTime) {
    return false;
  }

  const due = new Date(todo.dueTime);
  if (Number.isNaN(due.getTime())) {
    return false;
  }

  const mode = getNotifyMode(todo);
  const thresholdMs = mode === "daily" ? NOTIFY_OFFSET_MS["1d"] : NOTIFY_OFFSET_MS[mode];
  const diff = due.getTime() - Date.now();
  return diff >= 0 && diff <= thresholdMs;
};

const isOverdue = (todo) => {
  if (!todo.dueTime) {
    return false;
  }

  const due = new Date(todo.dueTime);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
};

const persistLastNotifiedDate = (todo) => {
  const todos = loadTodos();
  const match = todos.find((item) => getTodoKey(item) === getTodoKey(todo));
  if (match) {
    match.lastNotifiedDate = todo.lastNotifiedDate;
    saveTodos(todos);
  }
};

const notifyDueSoon = (todo) => {
  if (!todo.dueTime || todo.done) {
    return;
  }

  const due = new Date(todo.dueTime);
  if (Number.isNaN(due.getTime())) {
    return;
  }

  const mode = getNotifyMode(todo);

  if (mode === "daily") {
    const today = new Date().toDateString();
    if (todo.lastNotifiedDate === today) {
      return;
    }
    todo.lastNotifiedDate = today;
    persistLastNotifiedDate(todo);
    sendNotice("Todoのお知らせ", `${todo.text}\n期限: ${formatTodoTime(todo.dueTime)}`);
    return;
  }

  const key = getTodoKey(todo);
  if (alertedTodoIds.has(key)) {
    return;
  }

  if (isDueSoon(todo)) {
    alertedTodoIds.add(key);
    sendNotice("期限が近いTodoがあります", `${todo.text}\n期限: ${formatTodoTime(todo.dueTime)}`);
  }
};

const renderTodos = () => {
  const todos = loadTodos();
  todoList.innerHTML = "";

  if (todos.length === 0) {
    const empty = document.createElement("li");
    empty.className = "todo-item";
    empty.textContent = "ここにTodoが表示されます。";
    todoList.appendChild(empty);
    return;
  }

  todos.forEach((todo, index) => {
    const item = document.createElement("li");
    item.className = `todo-item${todo.done ? " completed" : ""}`;

    const info = document.createElement("div");
    info.className = "todo-info";

    const text = document.createElement("span");
    text.textContent = todo.text;
    info.appendChild(text);

    const dueSoon = isDueSoon(todo);
    const overdue = isOverdue(todo);

    if (dueSoon) {
      item.classList.add("due-soon");
    }

    if (overdue && !todo.done) {
      item.classList.add("overdue");
    }

    if (todo.dueTime) {
      const dueWrap = document.createElement("div");
      dueWrap.className = "todo-time-wrap";

      const miniShelf = document.createElement("span");
      miniShelf.className = "mini-shelf";
      miniShelf.setAttribute("aria-hidden", "true");
      miniShelf.innerHTML =
        '<span class="mini-book mini-book-1"></span>' +
        '<span class="mini-book mini-book-2"></span>' +
        '<span class="mini-book mini-book-3"></span>' +
        '<span class="mini-shelf-board"></span>';
      dueWrap.appendChild(miniShelf);

      const due = document.createElement("time");
      due.className = "todo-time";
      due.textContent = `期限: ${formatTodoTime(todo.dueTime)} / 通知: ${NOTIFY_LABELS[getNotifyMode(todo)]}`;
      if (overdue) {
        due.textContent += "（期限切れ）";
      } else if (dueSoon) {
        due.textContent += "（もうすぐ）";
      }
      dueWrap.appendChild(due);
      info.appendChild(dueWrap);
    }

    notifyDueSoon(todo);

    const toggle = document.createElement("button");
    toggle.textContent = todo.done ? "元に戻す" : "完了";
    toggle.addEventListener("click", () => {
      todos[index].done = !todos[index].done;
      saveTodos(todos);
      renderTodos();
    });

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "削除";
    remove.addEventListener("click", () => {
      todos.splice(index, 1);
      saveTodos(todos);
      renderTodos();
    });

    item.appendChild(info);
    item.appendChild(toggle);
    item.appendChild(remove);
    todoList.appendChild(item);
  });
};

const addTodo = () => {
  const text = todoInput.value.trim();
  const dueTime = dueInput.value;
  const notify = notifyInput.value;
  if (text === "") {
    todoInput.focus();
    return;
  }

  const todos = loadTodos();
  todos.push({ text, dueTime: dueTime || null, done: false, notify, lastNotifiedDate: null });
  saveTodos(todos);
  todoInput.value = "";
  dueInput.value = "";
  updateDuePlaceholder();
  renderTodos();
};

const updateEnableNotifyButton = () => {
  if (!("Notification" in window)) {
    enableNotifyButton.textContent = "この端末は通知に対応していません";
    enableNotifyButton.disabled = true;
    return;
  }
  if (Notification.permission === "granted") {
    enableNotifyButton.textContent = "通知は有効です(タップで再登録)";
    enableNotifyButton.disabled = false;
    return;
  }
  if (Notification.permission === "denied") {
    enableNotifyButton.textContent = "通知が拒否されています(端末の設定から許可してください)";
    enableNotifyButton.disabled = true;
    return;
  }
  enableNotifyButton.textContent = "通知を有効にする";
  enableNotifyButton.disabled = false;
};

enableNotifyButton.addEventListener("click", async () => {
  enableNotifyButton.textContent = "登録中...";
  enableNotifyButton.disabled = true;
  ensureNotificationPermission();
  const ok = await registerPushSubscription();
  if (ok) {
    saveTodos(loadTodos());
  } else if (Notification.permission !== "denied") {
    enableNotifyButton.textContent = "登録に失敗しました(タップで再試行)";
    enableNotifyButton.disabled = false;
    return;
  }
  updateEnableNotifyButton();
});

addButton.addEventListener("click", addTodo);
todoInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addTodo();
  }
});
dueInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    addTodo();
  }
});

const checkDueSoonNotifications = () => {
  const todos = loadTodos();
  todos.forEach((todo) => {
    notifyDueSoon(todo);
  });
};

updateEnableNotifyButton();
if ("Notification" in window && Notification.permission === "granted") {
  registerPushSubscription();
}
renderTodos();
setInterval(checkDueSoonNotifications, ALERT_CHECK_INTERVAL_MS);
