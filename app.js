// app.js

const $ = (id) => document.getElementById(id);

const inputEl = $("input");
const btnAnalyze = $("btnAnalyze");
const okEl = $("ok");
const errEl = $("error");
const resultEl = $("result");

const temperatureEl = $("temperature");
const intensityEl = $("intensity");
const barEl = $("bar");
const driversEl = $("drivers");
const matchSummaryEl = $("matchSummary");
const tacticalRealityEl = $("tacticalReality");
const outcomesEl = $("outcomes");
const confidenceNoteEl = $("confidenceNote");
const jsonEl = $("json");

const btnCopyHuman = $("btnCopyHuman");
const btnCopyJson = $("btnCopyJson");

// ---------- helpers ----------
function showOk(msg) {
  okEl.style.display = "block";
  okEl.textContent = msg;
}
function hideOk() {
  okEl.style.display = "none";
  okEl.textContent = "";
}
function showErr(msg) {
  errEl.style.display = "block";
  errEl.textContent = msg;
}
function hideErr() {
  errEl.style.display = "none";
  errEl.textContent = "";
}

function stripCodeFences(s) {
  const t = (s || "").trim();
  if (!t.startsWith("```")) return t;

  const lines = t.split("\n");
  lines.shift(); // remove ```json ou ```
  if (lines.length && lines[lines.length - 1].trim().startsWith("```")) lines.pop();
  return lines.join("\n").trim();
}

function safeParseJSON(raw) {
  try {
    const cleaned = stripCodeFences(raw);
    return { ok: true, data: JSON.parse(cleaned) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), raw };
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  }
}

// ---------- render ----------
let lastPayload = null; // para copiar resumo/json

function render(payload) {
  lastPayload = payload;

  // debug JSON
  jsonEl.textContent = JSON.stringify(payload, null, 2);

  // mostra bloco resultados
  resultEl.style.display = "block";

  // Temperatura (aceita texto ou número)
  const temp =
    typeof payload.temperature === "number"
      ? `Temperatura ${payload.temperature}`
      : (payload.temperature || "—");
  temperatureEl.textContent = temp;

  // Intensidade 0-10
  const i = clamp(Number(payload.intensity ?? 0) || 0, 0, 10);
  intensityEl.textContent = `${i}/10`;
  barEl.style.width = `${(i / 10) * 100}%`;

  // Gatilhos (máx 3)
  const triggers = Array.isArray(payload.triggers)
    ? payload.triggers.filter(Boolean).slice(0, 3)
    : [];

  driversEl.innerHTML = triggers.length
    ? triggers.map(t => `<span class="pill">${escapeHtml(t)}</span>`).join("")
    : `<span class="pill">—</span>`;

  // Cenário tático + fatores
  matchSummaryEl.textContent = payload.tacticalScenario || payload.matchSummary || "—";
  tacticalRealityEl.textContent = payload.factors || payload.tacticalReality || "—";

  // Nota/confiança (opcional)
  confidenceNoteEl.textContent = payload.confidenceNote || "";

  // Scorelines (máx 2)
  outcomesEl.innerHTML = "";
  const s = payload.scorelines;

  const normalized = Array.isArray(s)
    ? s.slice(0, 2).map(x => {
        if (typeof x === "string") return { score: x };
        return { score: x.score, tag: x.tag, why: x.why };
      })
    : [];

  if (!normalized.length) {
    outcomesEl.innerHTML = `<div class="card"><div class="title">Resultados possíveis</div><div>—</div></div>`;
    return;
  }

  normalized.forEach((item, idx) => {
    const tag = item.tag ? `<span class="label">${escapeHtml(item.tag)}</span>` : "";
    const why = item.why ? `<div style="margin-top:10px; color:#cbd5e1; line-height:1.4">${escapeHtml(item.why)}</div>` : "";

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px">
        <div class="cs">${escapeHtml(item.score || "—")}</div>
        ${tag}
      </div>
      ${why}
    `;
    outcomesEl.appendChild(card);
  });
}

// ---------- analyze ----------
let cooldown = false;

async function analyze() {
  hideErr();
  hideOk();

  const inputText = (inputEl.value || "").trim();
  if (!inputText) {
    showErr("Cole algum contexto do jogo primeiro.");
    return;
  }

  // cooldown simples (evita spam / limites)
  if (cooldown) return;
  cooldown = true;
  btnAnalyze.disabled = true;

  try {
    showOk("A gerar leitura...");

    const res = await fetch("/.netlify/functions/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputText }),
    });

    const data = await res.json(); // a tua function devolve { content: "..." } ou { error: "..." }

    // se vier erro direto
    if (data?.error) {
      jsonEl.textContent = JSON.stringify(data, null, 2);
      resultEl.style.display = "block";
      showErr(String(data.error));
      return;
    }

    const raw = typeof data?.content === "string" ? data.content : "";
    if (!raw) {
      jsonEl.textContent = JSON.stringify(data, null, 2);
      resultEl.style.display = "block";
      showErr("Resposta vazia do servidor.");
      return;
    }

    // 1) tenta parse direto
    let parsed = safeParseJSON(raw);

    // 2) se veio JSON aninhado {content:"..."}
    if (parsed.ok && parsed.data && typeof parsed.data.content === "string") {
      const parsed2 = safeParseJSON(parsed.data.content);
      if (parsed2.ok) parsed = parsed2;
    }

    if (!parsed.ok) {
      // mostra raw no debug e dá erro amigável
      jsonEl.textContent = stripCodeFences(raw);
      resultEl.style.display = "block";

      const txt = stripCodeFences(raw);
      if (txt.includes("exceeded your current quota") || txt.includes("insufficient_quota")) {
        showErr("Sem quota/créditos na OpenAI. Ativa Billing e tenta de novo.");
      } else if (txt.includes("Incorrect API key") || txt.includes("invalid_api_key")) {
        showErr("API key inválida. Confirma OPENAI_API_KEY no Netlify.");
      } else {
        showErr("Não consegui ler o JSON da resposta (formato inesperado).");
      }
      return;
    }

    render(parsed.data);
    showOk("Leitura gerada com sucesso.");
  } catch (e) {
    showErr("Falha a contactar o servidor. " + String(e?.message || e));
  } finally {
    // cooldown 25s (ajusta se quiseres)
    setTimeout(() => {
      cooldown = false;
      btnAnalyze.disabled = false;
    }, 25000);
  }
}

// ---------- events ----------
btnAnalyze.addEventListener("click", analyze);

btnCopyHuman.addEventListener("click", async () => {
  if (!lastPayload) return;

  const lines = [];
  if (lastPayload.temperature) lines.push(`TEMPERATURA: ${lastPayload.temperature}`);
  if (typeof lastPayload.intensity !== "undefined") lines.push(`INTENSIDADE: ${lastPayload.intensity}/10`);
  if (Array.isArray(lastPayload.triggers) && lastPayload.triggers.length) {
    lines.push(`GATILHOS: ${lastPayload.triggers.slice(0,3).join(" | ")}`);
  }
  if (lastPayload.tacticalScenario) lines.push(`CENÁRIO: ${lastPayload.tacticalScenario}`);
  if (Array.isArray(lastPayload.scorelines) && lastPayload.scorelines.length) {
    const s = lastPayload.scorelines
      .slice(0,2)
      .map(x => (typeof x === "string" ? x : x.score))
      .filter(Boolean)
      .join(" / ");
    lines.push(`SCORELINES: ${s}`);
  }

  const text = lines.join("\n");
  await copyText(text || "—");
  showOk("Resumo copiado ✅");
  setTimeout(hideOk, 1200);
});

btnCopyJson.addEventListener("click", async () => {
  const text = JSON.stringify(lastPayload ?? {}, null, 2);
  await copyText(text);
  showOk("JSON copiado ✅");
  setTimeout(hideOk, 1200);
});
