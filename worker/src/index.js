import { buildPushPayload } from "@block65/webcrypto-web-push";

const NOTIFY_OFFSET_MS = {
  "1h": 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "3h": 3 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

const corsHeaders = (env) => ({
  "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});

const getTodoKey = (todo) => `${todo.text}::${todo.dueTime}`;

const getClientIds = async (env) => {
  const raw = await env.TODO_KV.get("client-index");
  return raw ? JSON.parse(raw) : [];
};

const addClientId = async (env, clientId) => {
  const ids = await getClientIds(env);
  if (!ids.includes(clientId)) {
    ids.push(clientId);
    await env.TODO_KV.put("client-index", JSON.stringify(ids));
  }
};

const handleSubscribe = async (request, env) => {
  const { clientId, subscription } = await request.json();
  if (!clientId || !subscription) {
    return new Response("Bad Request", { status: 400, headers: corsHeaders(env) });
  }

  await env.TODO_KV.put(`sub:${clientId}`, JSON.stringify(subscription));
  await addClientId(env, clientId);
  return new Response("OK", { headers: corsHeaders(env) });
};

const handleSync = async (request, env) => {
  const { clientId, todos } = await request.json();
  if (!clientId || !Array.isArray(todos)) {
    return new Response("Bad Request", { status: 400, headers: corsHeaders(env) });
  }

  const existingRaw = await env.TODO_KV.get(`todos:${clientId}`);
  const existing = existingRaw ? JSON.parse(existingRaw) : [];
  const existingByKey = new Map(existing.map((todo) => [getTodoKey(todo), todo]));

  const merged = todos.map((todo) => {
    const prev = existingByKey.get(getTodoKey(todo));
    return {
      ...todo,
      notifiedOnce: prev ? prev.notifiedOnce : false,
      lastNotifiedDate: prev ? prev.lastNotifiedDate : null,
    };
  });

  await env.TODO_KV.put(`todos:${clientId}`, JSON.stringify(merged));
  await addClientId(env, clientId);
  return new Response("OK", { headers: corsHeaders(env) });
};

const isDueSoon = (todo, now) => {
  if (!todo.dueTime) {
    return false;
  }

  const due = new Date(todo.dueTime).getTime();
  if (Number.isNaN(due)) {
    return false;
  }

  const mode = todo.notify || "1h";
  const thresholdMs = mode === "daily" ? NOTIFY_OFFSET_MS["1d"] : NOTIFY_OFFSET_MS[mode];
  const diff = due - now;
  return diff >= 0 && diff <= thresholdMs;
};

const sendPushToClient = async (env, clientId, title, body) => {
  const subRaw = await env.TODO_KV.get(`sub:${clientId}`);
  if (!subRaw) {
    return;
  }

  const subscription = JSON.parse(subRaw);
  const message = {
    data: JSON.stringify({ title, body }),
    options: { ttl: 3600, urgency: "high" },
  };
  const vapidKeys = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  try {
    const payload = await buildPushPayload(message, subscription, vapidKeys);
    const res = await fetch(subscription.endpoint, payload);
    if (res.status === 404 || res.status === 410) {
      await env.TODO_KV.delete(`sub:${clientId}`);
    }
  } catch (err) {
    console.error("push failed", clientId, err);
  }
};

const checkDueTodos = async (env) => {
  const now = Date.now();
  const clientIds = await getClientIds(env);

  for (const clientId of clientIds) {
    const raw = await env.TODO_KV.get(`todos:${clientId}`);
    if (!raw) {
      continue;
    }

    const todos = JSON.parse(raw);
    let changed = false;

    for (const todo of todos) {
      if (todo.done || !todo.dueTime) {
        continue;
      }

      const mode = todo.notify || "1h";
      const due = new Date(todo.dueTime).getTime();
      if (Number.isNaN(due)) {
        continue;
      }

      if (mode === "daily") {
        const today = new Date(now).toDateString();
        if (todo.lastNotifiedDate === today) {
          continue;
        }
        todo.lastNotifiedDate = today;
        changed = true;
        await sendPushToClient(env, clientId, "Todoのお知らせ", todo.text);
        continue;
      }

      if (todo.notifiedOnce) {
        continue;
      }

      if (isDueSoon(todo, now)) {
        todo.notifiedOnce = true;
        changed = true;
        await sendPushToClient(env, clientId, "期限が近いTodoがあります", todo.text);
      }
    }

    if (changed) {
      await env.TODO_KV.put(`todos:${clientId}`, JSON.stringify(todos));
    }
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (request.method === "POST" && url.pathname === "/api/subscribe") {
      return handleSubscribe(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/sync") {
      return handleSync(request, env);
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders(env) });
  },

  async scheduled(_event, env) {
    await checkDueTodos(env);
  },
};
