// netlify/functions/analyze.mjs
export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { inputText } = await req.json();

    const prompt = `
Tu és o Matchday Reality Engine.
Faz uma leitura REALISTA de futebol (PT-PT).
Sem exageros. Máx 2 cenários de resultado.

Texto base:
${inputText}

Responde em JSON com:
temperature,
intensity (0-10),
triggers (3),
tacticalScenario,
scorelines (max 2),
summary
`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: "Responde apenas em JSON válido." },
          { role: "user", content: prompt }
        ]
      })
    });

  const data = await r.json();

// Proteção contra respostas inesperadas
const content =
  data?.choices?.[0]?.message?.content ??
  data?.error?.message ??
  "Erro: resposta vazia do modelo.";

return new Response(
  JSON.stringify({ content }),
  { headers: { "Content-Type": "application/json" } }
);

  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500 }
    );
  }
};
