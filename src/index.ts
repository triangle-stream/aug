interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_TOKEN: string;
}

type GameRow = {
  id: number;
  title: string;
  birthday_at: string;
  duration_seconds: number;
  entry_question: string;
  entry_answer_hash: string;
  started_at: string | null;
  expires_at: string | null;
  completed_at: string | null;
  active_session_hash: string | null;
};

type StepRow = {
  id: number;
  position: number;
  question: string;
  answer_hash: string;
  points: number;
  reward_title: string;
  reward_text: string | null;
  latitude: number | null;
  longitude: number | null;
  locker_code: string | null;
  locker_revealed_at: string | null;
  unlock_word_hash: string | null;
  unlocked_at: string | null;
  completed_at: string | null;
  reward_acknowledged_at: string | null;
  word_verified_at: string | null;
};

type MessageRow = {
  id: number;
  sender: "player" | "admin";
  body: string;
  created_at: string;
};

const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

const normalize = (value: string) => value.trim().toLocaleLowerCase("it-IT").normalize("NFKC");
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (value: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
const nowIso = () => new Date().toISOString();

function cookie(req: Request, name: string) {
  const raw = req.headers.get("cookie") || "";
  for (const item of raw.split(";")) {
    const [key, ...rest] = item.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

async function getGame(env: Env) {
  return env.DB.prepare("SELECT * FROM game WHERE id=1").first<GameRow>();
}

async function getSteps(env: Env) {
  return (await env.DB.prepare("SELECT * FROM steps ORDER BY position").all<StepRow>()).results;
}

async function requireSession(req: Request, env: Env) {
  const token = cookie(req, "hunt_session");
  if (!token) return false;
  const game = await getGame(env);
  if (!game?.active_session_hash) return false;
  return (await sha256(token)) === game.active_session_hash;
}

async function body(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function rateLimited(env: Env, kind: string, stepId: number | null = null) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const query = stepId == null
    ? env.DB.prepare("SELECT COUNT(*) c FROM attempts WHERE kind=? AND attempted_at>=?").bind(kind, since)
    : env.DB.prepare("SELECT COUNT(*) c FROM attempts WHERE kind=? AND step_id=? AND attempted_at>=?").bind(kind, stepId, since);
  const row = await query.first<{ c: number }>();
  return (row?.c || 0) >= 8;
}

async function status(env: Env, authorized: boolean) {
  const game = await getGame(env);
  if (!game) return json({ error: "Game not initialized" }, 500);

  const now = Date.now();
  const birthday = new Date(game.birthday_at).getTime();
  const expires = game.expires_at ? new Date(game.expires_at).getTime() : null;
  const expired = expires !== null && now > expires && !game.completed_at;

  const base: any = {
    title: game.title,
    birthdayAt: game.birthday_at,
    available: now >= birthday,
    authorized,
    startedAt: game.started_at,
    expiresAt: game.expires_at,
    completedAt: game.completed_at,
    expired,
  };

  if (!authorized) {
    base.entryQuestion = now >= birthday ? game.entry_question : null;
    return json(base);
  }

  const steps = await getSteps(env);
  const score = steps.filter((step) => !!step.completed_at).reduce((sum, step) => sum + Number(step.points || 0), 0);
  const maxScore = steps.reduce((sum, step) => sum + Number(step.points || 0), 0);
  const giftsFound = steps.filter((step) => !!step.word_verified_at).length;
  const current = steps.find((step) => !step.word_verified_at) || null;

  base.progress = {
    total: steps.length,
    giftsFound,
    current: current?.position ?? steps.length,
    score,
    maxScore,
  };

  if (!current || game.completed_at) {
    base.currentStep = null;
    return json(base);
  }

  if (!current.completed_at) {
    base.currentStep = {
      id: current.id,
      position: current.position,
      phase: "question",
      question: current.question,
      points: Number(current.points || 0),
    };
  } else {
    base.currentStep = {
      id: current.id,
      position: current.position,
      phase: "reward",
      points: Number(current.points || 0),
      completedAt: current.completed_at,
      reward: {
        title: current.reward_title,
        text: current.reward_text,
        latitude: current.latitude,
        longitude: current.longitude,
        hasLockerCode: !!current.locker_code,
        lockerCodeRevealed: !!current.locker_revealed_at,
      },
      asksForWord: !!current.unlock_word_hash,
    };
  }

  return json(base);
}

async function activate(req: Request, env: Env) {
  const game = await getGame(env);
  if (!game) return json({ error: "Game not initialized" }, 500);
  if (Date.now() < new Date(game.birthday_at).getTime()) return json({ error: "Non ancora." }, 403);
  if (await rateLimited(env, "entry")) return json({ error: "Troppi tentativi. Riprova tra un minuto." }, 429);

  const requiresEntryAnswer = Boolean(game.entry_answer_hash);
  if (requiresEntryAnswer) {
    const data = await body(req);
    const answerHash = await sha256(normalize(String(data.answer || "")));
    const ok = answerHash === game.entry_answer_hash;
    await env.DB.prepare("INSERT INTO attempts(kind,attempted_at,success) VALUES('entry',?,?)")
      .bind(nowIso(), ok ? 1 : 0)
      .run();
    if (!ok) return json({ error: "Risposta sbagliata." }, 401);
  }

  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await sha256(token);
  const startedAt = game.started_at || nowIso();
  const expiresAt = game.expires_at || new Date(new Date(startedAt).getTime() + game.duration_seconds * 1000).toISOString();

  await env.DB.prepare("UPDATE game SET started_at=?, expires_at=?, active_session_hash=? WHERE id=1")
    .bind(startedAt, expiresAt, tokenHash)
    .run();

  return json({ ok: true, startedAt, expiresAt }, 200, {
    "set-cookie": `hunt_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=259200`,
  });
}

async function answerStep(req: Request, env: Env, id: number) {
  if (!(await requireSession(req, env))) return json({ error: "Sessione non valida." }, 401);

  const game = await getGame(env);
  if (!game?.started_at || !game.expires_at) return json({ error: "Gioco non iniziato." }, 409);
  if (game.completed_at) return json({ error: "La caccia è già completata." }, 409);
  if (Date.now() > new Date(game.expires_at).getTime()) return json({ error: "Il tempo è scaduto." }, 410);
  if (await rateLimited(env, "step", id)) return json({ error: "Troppi tentativi. Aspetta un minuto." }, 429);

  const step = await env.DB.prepare("SELECT * FROM steps WHERE id=?").bind(id).first<StepRow>();
  if (!step) return json({ error: "Step inesistente." }, 404);

  if (step.position > 1) {
    const previous = await env.DB.prepare("SELECT word_verified_at FROM steps WHERE position=?")
      .bind(step.position - 1)
      .first<{ word_verified_at: string | null }>();
    if (!previous?.word_verified_at) return json({ error: "Prima devi trovare la parola del regalo precedente." }, 403);
  }

  if (step.completed_at) return json({ ok: true, alreadyCompleted: true, points: step.points });

  const data = await body(req);
  const ok = (await sha256(normalize(String(data.answer || "")))) === step.answer_hash;
  await env.DB.prepare("INSERT INTO attempts(kind,step_id,attempted_at,success) VALUES('step',?,?,?)")
    .bind(id, nowIso(), ok ? 1 : 0)
    .run();

  if (!ok) return json({ error: "Non è la risposta giusta." }, 401);

  const ts = nowIso();
  await env.DB.prepare("UPDATE steps SET completed_at=?, unlocked_at=COALESCE(unlocked_at,?) WHERE id=?")
    .bind(ts, ts, id)
    .run();

  return json({ ok: true, points: Number(step.points || 0) });
}

async function verifyWord(req: Request, env: Env, id: number) {
  if (!(await requireSession(req, env))) return json({ error: "Sessione non valida." }, 401);

  const game = await getGame(env);
  if (!game?.started_at || !game.expires_at) return json({ error: "Gioco non iniziato." }, 409);
  if (Date.now() > new Date(game.expires_at).getTime() && !game.completed_at) return json({ error: "Il tempo è scaduto." }, 410);
  if (await rateLimited(env, "word", id)) return json({ error: "Troppi tentativi. Aspetta un minuto." }, 429);

  const step = await env.DB.prepare("SELECT * FROM steps WHERE id=?").bind(id).first<StepRow>();
  if (!step) return json({ error: "Step inesistente." }, 404);
  if (!step.completed_at) return json({ error: "Devi prima rispondere bene alla domanda." }, 403);
  if (step.word_verified_at) return json({ ok: true, alreadyVerified: true });
  if (!step.unlock_word_hash) return json({ error: "Nessuna parola configurata per questo regalo." }, 409);

  const data = await body(req);
  const ok = (await sha256(normalize(String(data.word || "")))) === step.unlock_word_hash;

  await env.DB.prepare("INSERT INTO attempts(kind,step_id,attempted_at,success) VALUES('word',?,?,?)")
    .bind(id, nowIso(), ok ? 1 : 0)
    .run();

  if (!ok) return json({ error: "Non è la parola giusta." }, 401);

  const ts = nowIso();
  await env.DB.prepare(
    "UPDATE steps SET word_verified_at=?, reward_acknowledged_at=COALESCE(reward_acknowledged_at,?) WHERE id=?",
  )
    .bind(ts, ts, id)
    .run();

  const remaining = await env.DB.prepare("SELECT COUNT(*) c FROM steps WHERE word_verified_at IS NULL").first<{ c: number }>();
  const complete = (remaining?.c || 0) === 0;
  if (complete) {
    await env.DB.prepare("UPDATE game SET completed_at=COALESCE(completed_at,?) WHERE id=1").bind(ts).run();
  }

  return json({ ok: true, complete });
}

async function revealLocker(req: Request, env: Env, id: number) {
  if (!(await requireSession(req, env))) return json({ error: "Sessione non valida." }, 401);

  const game = await getGame(env);
  if (!game?.expires_at) return json({ error: "Gioco non iniziato." }, 409);
  if (Date.now() > new Date(game.expires_at).getTime() && !game.completed_at) return json({ error: "Il tempo è scaduto." }, 410);

  const step = await env.DB.prepare("SELECT * FROM steps WHERE id=?").bind(id).first<StepRow>();
  if (!step?.completed_at || !step.locker_code) return json({ error: "Codice non disponibile." }, 403);
  if (step.locker_revealed_at) return json({ error: "Il codice è già stato rivelato e non può essere mostrato di nuovo." }, 410);

  const ts = nowIso();
  const result = await env.DB.prepare("UPDATE steps SET locker_revealed_at=? WHERE id=? AND locker_revealed_at IS NULL")
    .bind(ts, id)
    .run();

  if (!result.meta.changes) return json({ error: "Il codice è già stato rivelato." }, 410);
  return json({ code: step.locker_code, revealedAt: ts });
}

async function getChat(req: Request, env: Env) {
  if (!(await requireSession(req, env))) return json({ error: "Sessione non valida." }, 401);
  const messages = (await env.DB.prepare("SELECT id,sender,body,created_at FROM messages ORDER BY id DESC LIMIT 100").all<MessageRow>()).results.reverse();
  return json({ messages });
}

async function postPlayerChat(req: Request, env: Env) {
  if (!(await requireSession(req, env))) return json({ error: "Sessione non valida." }, 401);
  const data = await body(req);
  const message = String(data.message || "").trim();
  if (!message || message.length > 500) return json({ error: "Messaggio non valido." }, 400);
  await env.DB.prepare("INSERT INTO messages(sender,body,created_at) VALUES('player',?,?)").bind(message, nowIso()).run();
  return json({ ok: true });
}

function adminOk(req: Request, env: Env) {
  return req.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN}`;
}

async function getAdminChat(req: Request, env: Env) {
  if (!adminOk(req, env)) return json({ error: "Unauthorized" }, 401);
  const messages = (await env.DB.prepare("SELECT id,sender,body,created_at FROM messages ORDER BY id DESC LIMIT 100").all<MessageRow>()).results.reverse();
  return json({ messages });
}

async function postAdminChat(req: Request, env: Env) {
  if (!adminOk(req, env)) return json({ error: "Unauthorized" }, 401);
  const data = await body(req);
  const message = String(data.message || "").trim();
  if (!message || message.length > 500) return json({ error: "Messaggio non valido" }, 400);
  await env.DB.prepare("INSERT INTO messages(sender,body,created_at) VALUES('admin',?,?)").bind(message, nowIso()).run();
  return json({ ok: true });
}

async function adminState(req: Request, env: Env) {
  if (!adminOk(req, env)) return json({ error: "Unauthorized" }, 401);
  const game = await getGame(env);
  const steps = (await env.DB.prepare(
    "SELECT id,position,question,points,reward_title,completed_at,word_verified_at,reward_acknowledged_at,locker_revealed_at,locker_code FROM steps ORDER BY position",
  ).all()).results;
  const attempts = (await env.DB.prepare("SELECT * FROM attempts ORDER BY id DESC LIMIT 80").all()).results;
  const scoreRow = await env.DB.prepare("SELECT COALESCE(SUM(points),0) score FROM steps WHERE completed_at IS NOT NULL").first<{ score: number }>();
  const maxRow = await env.DB.prepare("SELECT COALESCE(SUM(points),0) maxScore FROM steps").first<{ maxScore: number }>();
  return json({ game, score: scoreRow?.score || 0, maxScore: maxRow?.maxScore || 0, steps, attempts });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/api/status" && req.method === "GET") return status(env, await requireSession(req, env));
    if (url.pathname === "/api/activate" && req.method === "POST") return activate(req, env);
    if (url.pathname === "/api/chat" && req.method === "GET") return getChat(req, env);
    if (url.pathname === "/api/chat" && req.method === "POST") return postPlayerChat(req, env);

    const answerMatch = url.pathname.match(/^\/api\/steps\/(\d+)\/answer$/);
    if (answerMatch && req.method === "POST") return answerStep(req, env, Number(answerMatch[1]));

    const wordMatch = url.pathname.match(/^\/api\/steps\/(\d+)\/word$/);
    if (wordMatch && req.method === "POST") return verifyWord(req, env, Number(wordMatch[1]));

    const lockerMatch = url.pathname.match(/^\/api\/steps\/(\d+)\/locker$/);
    if (lockerMatch && req.method === "POST") return revealLocker(req, env, Number(lockerMatch[1]));

    if (url.pathname === "/api/admin/state" && req.method === "GET") return adminState(req, env);
    if (url.pathname === "/api/admin/chat" && req.method === "GET") return getAdminChat(req, env);
    if (url.pathname === "/api/admin/chat" && req.method === "POST") return postAdminChat(req, env);
    if (url.pathname === "/api/admin/notify" && req.method === "POST") return postAdminChat(req, env);

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
