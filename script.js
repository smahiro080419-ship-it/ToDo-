const todoInput = document.getElementById("todoInput");
const dueInput = document.getElementById("dueInput");
const addButton = document.getElementById("addButton");
const todoList = document.getElementById("todoList");

const STORAGE_KEY = "todoItems";
const DUE_SOON_THRESHOLD_MS = 60 * 60 * 1000;
const ALERT_CHECK_INTERVAL_MS = 60 * 1000;
const alertedTodoIds = new Set();

const playNoticeSound = () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    return;
  }
  const context = new AudioContext();
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

const loadTodos = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
};

const saveTodos = (todos) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
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

  const diff = due.getTime() - Date.now();
  return diff >= 0 && diff <= DUE_SOON_THRESHOLD_MS;
};

const isOverdue = (todo) => {
  if (!todo.dueTime) {
    return false;
  }

  const due = new Date(todo.dueTime);
  return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
};

const notifyDueSoon = (todo) => {
  if (!todo.dueTime || todo.done) {
    return;
  }

  const key = getTodoKey(todo);
  if (alertedTodoIds.has(key)) {
    return;
  }

  if (isDueSoon(todo)) {
    alertedTodoIds.add(key);
    playNoticeSound();
    alert(`期限が近いTodoがあります:\n${todo.text}\n期限: ${formatTodoTime(todo.dueTime)}`);
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
      const due = document.createElement("time");
      due.className = "todo-time";
      due.textContent = `期限: ${formatTodoTime(todo.dueTime)}`;
      if (overdue) {
        due.textContent += "（期限切れ）";
      } else if (dueSoon) {
        due.textContent += "（もうすぐ）";
      }
      info.appendChild(due);
    }

    if (dueSoon) {
      notifyDueSoon(todo);
    }

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
  if (text === "") {
    todoInput.focus();
    return;
  }

  const todos = loadTodos();
  todos.push({ text, dueTime: dueTime || null, done: false });
  saveTodos(todos);
  todoInput.value = "";
  dueInput.value = "";
  renderTodos();
};

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

renderTodos();
setInterval(checkDueSoonNotifications, ALERT_CHECK_INTERVAL_MS);
