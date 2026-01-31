(function(){
  let lastJson = null;
  let lastHuman = '';

  function show(el, msg){
    el.textContent = msg;
    el.style.display = 'block';
  }
  function hide(el){
    el.textContent = '';
    el.style.display = 'none';
  }

  function tempClass(t){
    const s = (t||'').toLowerCase();
    if (s.includes('quente')) return {color:'#fb923c', bg:'rgba(251,146,60,.10)', border:'rgba(251,146,60,.25)'};
    if (s.includes('morna')) return {color:'#facc15', bg:'rgba(250,204,21,.10)', border:'rgba(250,204,21,.25)'};
    return {color:'#60a5fa', bg:'rgba(96,165,250,.10)', border:'rgba(96,165,250,.25)'};
  }

  function buildHuman(r){
    const cs = (r.suggestedOutcomes||[]).map(o => `${o.score} (${o.probabilityLabel})`).join(' | ');
    const drivers = (r.keyDrivers||[]).slice(0,3).join(' • ');
    return [
      `🔥 Temperatura: ${r.temperature} | Intensidade: ${r.intensityLevel}/10`,
      `🎯 CS: ${cs}`,
      `🧠 Drivers: ${drivers}`,
      `📌 Nota: ${r.confidenceNote}`,
    ].join('\n');
  }

  function render(r){
    const result = document.getElementById('result');
    result.style.display = 'block';

    const temp = document.getElementById('temperature');
    const intensity = document.getElementById('intensity');
    const bar = document.getElementById('bar');
    const drivers = document.getElementById('drivers');
    const matchSummary = document.getElementById('matchSummary');
    const tacticalReality = document.getElementById('tacticalReality');
    const outcomes = document.getElementById('outcomes');
    const confidence = document.getElementById('confidenceNote');
    const json = document.getElementById('json');

    const tc = tempClass(r.temperature);
    const tempCard = document.getElementById('tempCard');
    tempCard.style.background = tc.bg;
    tempCard.style.borderColor = tc.border;
    temp.style.color = tc.color;

    temp.textContent = r.temperature || '';
    intensity.textContent = `${r.intensityLevel || 0}/10`;
    const pct = Math.max(0, Math.min(100, (Number(r.intensityLevel)||0) * 10));
    bar.style.width = pct + '%';

    drivers.innerHTML = (r.keyDrivers||[]).slice(0,3).map(d => `<span class="pill">${escapeHtml(d)}</span>`).join('');
    matchSummary.textContent = r.matchSummary || '';
    tacticalReality.textContent = r.tacticalReality || '';

    outcomes.innerHTML = (r.suggestedOutcomes||[]).slice(0,2).map(o => `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px">
          <div class="cs">${escapeHtml(o.score)}</div>
          <div class="label">${escapeHtml(o.probabilityLabel)}</div>
        </div>
        <div style="margin-top:10px; color:#94a3b8; font-size:12px; line-height:1.35">${escapeHtml(o.reason)}</div>
      </div>
    `).join('');

    confidence.textContent = r.confidenceNote || '';
    json.textContent = JSON.stringify(r, null, 2);

    lastJson = r;
    lastHuman = buildHuman(r);
  }

  function escapeHtml(s){
    return String(s ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;');
  }

  async function copy(text){
    try{
      await navigator.clipboard.writeText(text);
      return true;
    }catch{
      // fallback
      const ta=document.createElement('textarea');
      ta.value=text; document.body.appendChild(ta);
      ta.select();
      try{ document.execCommand('copy'); } finally { document.body.removeChild(ta); }
      return true;
    }
  }

  async function analyze(){
    const okEl = document.getElementById('ok');
    const errEl = document.getElementById('error');
    hide(okEl); hide(errEl);

    const input = document.getElementById('input');
    const rawText = (input?.value || '').trim();
    if(!rawText){
      show(errEl, 'Cole algum texto antes de analisar.');
      return;
    }

    const btn = document.getElementById('btnAnalyze');
    btn.disabled = true;
    btn.textContent = 'A analisar...';

    try{
      const res = await fetch('/api/analyze', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ text: rawText })
      });

      if(!res.ok){
        const msg = await res.text().catch(()=> '');
        throw new Error(msg || 'Erro ao contactar o motor.');
      }

      const data = await res.json();
      render(data);
      show(okEl, 'Leitura gerada com sucesso.');
    }catch(e){
      show(errEl, String(e?.message || e));
    }finally{
      btn.disabled = false;
      btn.textContent = 'Gerar Leitura de HOJE';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnAnalyze')?.addEventListener('click', analyze);
    document.getElementById('btnCopyJson')?.addEventListener('click', async () => {
      if(!lastJson) return;
      await copy(JSON.stringify(lastJson, null, 2));
      alert('JSON copiado!');
    });
    document.getElementById('btnCopyHuman')?.addEventListener('click', async () => {
      if(!lastHuman) return;
      await copy(lastHuman);
      alert('Resumo copiado!');
    });
  });

  // PWA SW
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
})();