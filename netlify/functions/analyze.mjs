// app.js — Matchday Reality Engine (Netlify Function + OpenAI)
// Cola este ficheiro inteiro e faz deploy.

const $ = (id) => document.getElementById(id);

// --------- Helpers UI ----------
function showOk(msg) {
  const okEl = $("ok");
  if (!okEl) return;
  okEl.style.display = "block";
  okEl.textContent = msg;
}
function hideOk() {
  const okEl = $("ok");
  if (!okEl) return;
  okEl.style.display = "none";
  okEl.textContent = "";
}
function showErr(msg) {
  const errEl = $("error");
  if (!errEl) return;
  errEl.style.display = "block";
  errEl.textContent = msg;
}
function hideErr() {
  const errEl = $("error");
  if (!errEl) return;
  errEl.style.display = "none";
  errEl.textContent = "";
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

// --------- JSON cleaning ----------
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

// --------- Clipboard ----------
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

// --------- State ----------
let lastPayload = null;
let cooldown = false;

// --------- Render ----------
function render(payload) {
  lastPayload = payload;

  const resultEl = $("result");
  const jsonEl = $("json");

  if (jsonEl) jsonEl.textContent = JSON.stringify(payload, null, 2);
  if (resultEl) resultEl.style.display = "block";

  // Temperatura
  const temperatureEl = $("temperature");
  const temp =
    typeof payload.temperature === "number"
      ? `Temperatura ${payload.temperature}`
      : (payload.temperature || "—");
  if (temperatureEl) temperatureEl.textContent = temp;

  // Intensidade
  const intensityEl = $("intensity");
  const barEl = $("bar");
  const i = clamp(Number(payload.intensity ?? 0) || 0, 0, 10);
  if (intensityEl) intensityEl.textContent = `${i}/10`;
  if (barEl) barEl.style.width = `${(i / 10) * 100}%`;

  // Gatilhos (pills)
  const driversEl = $("drivers");
  const triggers = Array.isArray(payload.triggers)
    ? payload.triggers.filter(Boolean).slice(0, 3)
    : [];

  if (driversEl) {
    driversEl.innerHTML = triggers.length
      ? triggers.map(t => `<span class="pill">${escapeHtml(t)}</span>`).join("")
      : `<span class="pill">—</span>`;
  }

  // Cenário + fatores
  const matchSummaryEl = $("matchSummary");
  const tacticalRealityEl = $("tacticalReality");

  const scenario = payload.tacticalScenario || payload.matchSummary || "—";
  const factors = payload.factors || payload.tacticalReality || "—";

  if (matchSummaryEl) matchSummaryEl.textContent = scenario;
  if (tacticalRealityEl) tacticalRealityEl.textContent = factors;

  // Nota/confiança (opcional)
  const confidenceNoteEl = $("confidenceNote");
  if (confidenceNoteEl) confidenceNoteEl.textContent = payload.confidenceNote || "";

  // Outcomes (scorelines) — LIMPA SEMPRE para não duplicar
  const outcomesEl = $("outcomes");
  if (outcomesEl) outcomesEl.innerHTML = "";

  const s = payload.scorelines;
  const normalized = Array.isArray(s)
    ? s.slice(0, 2).map(x => {
        if (typeof x === "string") return { score: x };
        return { score: x.score, tag: x.tag, why: x.why };
      })
    : [];

  if (!normalized.length) {
    if (outcomesEl) {
      outcomesEl.innerHTML = `
        <div class="card">
          <div class="title">Resultados possíveis</div>
          <div>—</div>
        </div>
      `;
    }
    return;
  }

  normalized.forEach((item) => {
    const tag = item.tag ? `<span class="label">${escapeHtml(item.tag)}</span>` : "";
    const why = item.why
      ? `<div style="margin-top:10px; color:#cbd5e1; line-height:1.4">${escapeHtml(item.why)}</div>`
      : "";

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px">
        <div class="cs">${escapeHtml(item.score || "—")}</div>
        ${tag}
      </div>
      ${why}
    `;
    if (outcomesEl) outcomesEl.appendChild(card);
  });
}

// --------- Analyze (call Netlify Function) ----------
async function analyze() {
  const inputEl = $("input");
  const btnAnalyze = $("btnAnalyze");
  const resultEl = $("result");
  const jsonEl = $("json");

  hideErr();
  // não apaga ok aqui para veres “a gerar...”
  // hideOk();

  const inputText = (inputEl?.value || "").trim();
  if (!inputText) {
    showErr("Cole algum contexto do jogo primeiro.");
    return;
  }

  // Anti-spam / Rate-limit
  if (cooldown) return;
  cooldown = true;
  if (btnAnalyze) btnAnalyze.disabled = true;

  try {
    showOk("A gerar leitura...");

    const res = await fetch("/.netlify/functions/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputText }),
    });

    // Se a function devolver HTML/erro estranho, isto pode falhar — por isso try/catch aqui
    let data;
    try {
      data = await res.json();
    } catch {
      const txt = await res.text();
      if (jsonEl) jsonEl.textContent = txt;
      if (resultEl) resultEl.style.display = "block";
      showErr("A função não devolveu JSON. Vê o Debug.");
      return;
    }

    // erro direto
    if (data?.error) {
      if (jsonEl) jsonEl.textContent = JSON.stringify(data, null, 2);
      if (resultEl) resultEl.style.display = "block";
      showErr(String(data.error));
      return;
    }

    const raw = typeof data?.content === "string" ? data.content : "";
    if (!raw) {
      if (jsonEl) jsonEl.textContent = JSON.stringify(data, null, 2);
      if (resultEl) resultEl.style.display = "block";
      showErr("Resposta vazia do servidor.");
      return;
    }

    // parse
    let parsed = safeParseJSON(raw);

    // se vier JSON aninhado { content: "```json ...```" }
    if (parsed.ok && parsed.data && typeof parsed.data.content === "string") {
      const parsed2 = safeParseJSON(parsed.data.content);
      if (parsed2.ok) parsed = parsed2;
    }

    if (!parsed.ok) {
      const txt = stripCodeFences(raw);
      if (jsonEl) jsonEl.textContent = txt;
      if (resultEl) resultEl.style.display = "block";

      if (txt.includes("exceeded your current quota") || txt.includes("insufficient_quota")) {
        showErr("Sem quota/créditos na OpenAI. Ativa Billing e tenta de novo.");
      } else if (txt.includes("Incorrect API key") || txt.includes("invalid_api_key")) {
        showErr("API key inválida. Confirma OPENAI_API_KEY no Netlify.");
      } else if (txt.includes("429")) {
        showErr("Muitos pedidos (429). Espera um pouco e tenta de novo.");
      } else {
        showErr("Não consegui ler o JSON da resposta (formato inesperado).");
      }
      return;
    }

    render(parsed.data);
    showOk("Leitura gerada com sucesso.");
    setTimeout(hideOk, 1500);

  } catch (e) {
    showErr("Falha a contactar o servidor. " + String(e?.message || e));
  } finally {
    setTimeout(() => {
      cooldown = false;
      if (btnAnalyze) btnAnalyze.disabled = false;
    }, 25000);
  }
}

// --------- Wire up events (SAFE) ----------
window.addEventListener("DOMContentLoaded", () => {
  const btnAnalyze = $("btnAnalyze");
  const btnCopyHuman = $("btnCopyHuman");
  const btnCopyJson = $("btnCopyJson");

  if (!btnAnalyze) {
    showErr("Erro interno: botão btnAnalyze não encontrado no HTML.");
    return;
  }

  btnAnalyze.addEventListener("click", analyze);

  if (btnCopyHuman) {
    btnCopyHuman.addEventListener("click", async () => {
      if (!lastPayload) return;

      const lines = [];
      if (lastPayload.temperature) lines.push(`TEMPERATURA: ${lastPayload.temperature}`);
      if (typeof lastPayload.intensity !== "undefined") lines.push(`INTENSIDADE: ${lastPayload.intensity}/10`);

      if (Array.isArray(lastPayload.triggers) && lastPayload.triggers.length) {
        lines.push(`GATILHOS: ${lastPayload.triggers.slice(0, 3).join(" | ")}`);
      }

      const scenario = lastPayload.tacticalScenario || lastPayload.matchSummary;
      if (scenario) lines.push(`CENÁRIO: ${scenario}`);

      if (Array.isArray(lastPayload.scorelines) && lastPayload.scorelines.length) {
        const s = lastPayload.scorelines
          .slice(0, 2)
          .map(x => (typeof x === "string" ? x : x.score))
          .filter(Boolean)
          .join(" / ");
        if (s) lines.push(`SCORELINES: ${s}`);
      }

      const text = lines.join("\n");
      await copyText(text || "—");
      showOk("Resumo copiado ✅");
      setTimeout(hideOk, 1200);
    });
  }

  if (btnCopyJson) {
    btnCopyJson.addEventListener("click", async () => {
      const text = JSON.stringify(lastPayload ?? {}, null, 2);
      await copyText(text);
      showOk("JSON copiado ✅");
      setTimeout(hideOk, 1200);
    });
  }
});
