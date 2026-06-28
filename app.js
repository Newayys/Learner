// ── État ──────────────────────────────────────────────────────────────────────
let allDocs     = [];
let pdfMap      = {};
let activeTheme = null;
let activeSubs  = new Set();
let appMode     = 'single';
let selectedThemes = new Set();

const COLORS = ['#3b82f6','#8b5cf6','#ec4899','#f97316','#10b981','#14b8a6','#f59e0b','#6366f1'];

// ── Mobile sidebar drawer ──────────────────────────────────────────────────────
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}
// Fermer le drawer après sélection d'un thème sur mobile
function closeSidebarOnMobile() {
  if (window.innerWidth <= 768) closeSidebar();
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO LOAD MANIFEST
// ─────────────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  loadManifest();

  // Bouton menu mobile
  document.getElementById('btn-menu-mobile').addEventListener('click', openSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
});

async function loadManifest() {
  try {
    const res = await fetch('./manifest.json');
    const manifest = await res.json();

    // ── PDF AUTO LOAD ──
    const pdfFiles = manifest.pdf || [];
    pdfFiles.forEach(path => {
      const name = path.split('/').pop().replace('.pdf','').toLowerCase();
      pdfMap[name] = path;
    });

    // ── JSON AUTO LOAD ──
    const jsonFiles = manifest.json || [];
    const results = await Promise.all(
      jsonFiles.map(path =>
        fetch(path)
          .then(r => r.json())
          .catch(() => null)
      )
    );

    allDocs = results.filter(Boolean).map(obj => ({
      concours: obj.concours || '?',
      filiere: obj.filiere || '?',
      date: obj.date || '?',
      pdfName: obj.file || null,
      label: (obj.file || `${obj.concours}_${obj.filiere}_${obj.date}`).replace('.pdf',''),
      parties: (obj.data || {}).parties || []
    }));

    buildFilters();
    buildThemeList();
    updateStats();

  } catch (e) {
    console.error("Erreur chargement manifest", e);
  }
}

// ── Mode ──────────────────────────────────────────────────────────────────────
function setMode(mode) {
  appMode = mode;
  document.getElementById('btn-mode-single').classList.toggle('active', mode === 'single');
  document.getElementById('btn-mode-multi').classList.toggle('active',  mode === 'multi');
  document.getElementById('multi-bar').classList.toggle('visible', mode === 'multi');
  document.getElementById('theme-list-label').textContent = mode === 'multi' ? 'Cocher les thèmes' : 'Thème à réviser';
  buildThemeList();
  if (mode === 'single') { selectedThemes.clear(); updateMultiBar(); }
  document.getElementById('main').innerHTML =
    `<div class="empty-state">
      <div class="big">${mode==='multi'?'🗂':'📚'}</div>
      <h2>${mode==='multi'?'Sélectionnez les thèmes à comparer':'Choisissez un thème à réviser'}</h2>
      <p>${mode==='multi'
        ?'Cochez plusieurs thèmes puis cliquez <strong>Comparer</strong>.'
        :'Cliquez sur un thème dans la barre de gauche.'}</p>
    </div>`;
}

// ── Upload ────────────────────────────────────────────────────────────────────
const fileInput = document.getElementById('file-input');
const dropZone  = document.getElementById('drop-zone');
fileInput.addEventListener('change', e => handleFiles([...e.target.files]));
dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag'); handleFiles([...e.dataTransfer.files]); });

async function handleFiles(files) {
  const jsonFiles = files.filter(f => f.name.toLowerCase().endsWith('.json'));
  const pdfFiles  = files.filter(f => f.name.toLowerCase().endsWith('.pdf'));

  pdfFiles.forEach(f => {
    const k = pdfKey(f.name);
    if (pdfMap[k]) URL.revokeObjectURL(pdfMap[k]);
    pdfMap[k] = URL.createObjectURL(f);
  });

  if (jsonFiles.length) {
    const results = await Promise.all(jsonFiles.map(f =>
      f.text().then(t => { try { return JSON.parse(t); } catch { return null; } })
    ));

    allDocs = results.filter(Boolean).map(obj => ({
      concours: obj.concours||'?',
      filiere: obj.filiere||'?',
      date: obj.date||'?',
      pdfName: obj.file||null,
      label: (obj.file||`${obj.concours}_${obj.filiere}_${obj.date}`).replace('.pdf',''),
      parties: (obj.data||{}).parties||[]
    }));

    buildFilters();
    buildThemeList();
  }

  updateStats();
  const el = document.getElementById('file-counts');
  const parts = [];
  if (allDocs.length) parts.push(`<span class="pdf-badge">${allDocs.length} JSON</span>`);
  if (Object.keys(pdfMap).length) parts.push(`<span class="pdf-badge">${Object.keys(pdfMap).length} PDF</span>`);
  el.innerHTML = parts.join('');
}

function pdfKey(name) { return name.replace(/\.pdf$/i,'').toLowerCase().trim(); }

function findPdfUrl(doc) {
  if (doc.pdfName) { const k = pdfKey(doc.pdfName); if (pdfMap[k]) return pdfMap[k]; }
  const k2 = doc.label.toLowerCase().trim(); if (pdfMap[k2]) return pdfMap[k2];
  const parts = [doc.concours,doc.filiere,doc.date].map(s=>(s||'').toLowerCase());
  for (const sep of ['_','-',' ']) { const k3 = parts.join(sep); if (pdfMap[k3]) return pdfMap[k3]; }
  const c=doc.concours.toLowerCase(), f=doc.filiere.toLowerCase(), y=String(doc.date);
  for (const [key,url] of Object.entries(pdfMap)) { if (key.includes(c)&&key.includes(f)&&key.includes(y)) return url; }
  return null;
}

function updateStats() {
  const nQ = allDocs.reduce((s,d)=>s+d.parties.reduce((s2,p)=>s2+p.questions.length,0),0);
  // Sur desktop on affiche le texte, sur mobile on l'a masqué via CSS
  document.getElementById('stat-files').textContent = `${allDocs.length} sujets chargés`;
  if (allDocs.length) {
    document.getElementById('stat-q').style.display='';
    document.getElementById('n-q').textContent=nQ.toLocaleString('fr');
  }
  const nPdf = Object.keys(pdfMap).length;
  const pdfEl = document.getElementById('pdf-status');
  if (nPdf>0) { pdfEl.style.display=''; pdfEl.innerHTML=`<span class="pdf-badge">${nPdf} PDF</span>`; }
}

// ── Filtres ───────────────────────────────────────────────────────────────────
function buildFilters() {
  const concours=[...new Set(allDocs.map(d=>d.concours))].sort();
  const filieres=[...new Set(allDocs.map(d=>d.filiere))].sort();
  document.getElementById('fil-concours').innerHTML='<option value="">Tous les concours</option>'+concours.map(c=>`<option>${c}</option>`).join('');
  document.getElementById('fil-filiere').innerHTML='<option value="">Toutes les filières</option>'+filieres.map(f=>`<option>${f}</option>`).join('');
}
function getFilteredDocs() {
  const c=document.getElementById('fil-concours').value, f=document.getElementById('fil-filiere').value;
  return allDocs.filter(d=>(!c||d.concours===c)&&(!f||d.filiere===f));
}
function applyFilters() { buildThemeList(); if (appMode==='single'&&activeTheme) showTheme(activeTheme); else if (appMode==='multi'&&selectedThemes.size>0) showMulti(); }

// ── Normalisation ─────────────────────────────────────────────────────────────
const CORRECTIONS = {
  'Transmissions mécanques':'Transmissions mécaniques',
  'Transmissionsmechmiques':'Transmissions mécaniques',
  'Transmissionsmécaniques':'Transmissions mécaniques',
  "Dynamique : Théorème de l'énergie cinétique":"Dynamique : Théorème de l'Énergie Cinétique",
};
function normalizeTheme(s) {
  if (!s) return s;
  s = CORRECTIONS[s]||s;
  s = s.replace(/([a-zàâäéèêëîïôùûüç])([A-ZÀÂÄÉÈÊËÎÏÔÙÛÜÇ])/g,'$1 $2');
  return s.trim();
}
function parseTheme(str) {
  str = normalizeTheme(str||'');
  const i = str.indexOf(':');
  if (i<0) return {main:str,sub:''};
  return {main:str.slice(0,i).trim(),sub:str.slice(i+1).trim()};
}
function normalizeQnum(q) {
  const m=q.trim().match(/^[Qq]uestion\s*[nN]?[°o]?\s*(\d+)$/);
  return m?`Q ${m[1]}`:q;
}

// ── Liste thèmes ──────────────────────────────────────────────────────────────
function buildThemeList() {
  const docs=getFilteredDocs(), counts={};
  docs.forEach(d=>d.parties.forEach(p=>p.questions.forEach(q=>(q.mots_cles||[]).forEach(mk=>{
    const {main}=parseTheme(mk.theme); if (main) counts[main]=(counts[main]||0)+1;
  }))));
  const total=Object.values(counts).reduce((a,b)=>a+b,0)||1;
  const sorted=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const list=document.getElementById('theme-list');
  if (!sorted.length) { list.innerHTML='<div style="padding:16px;color:var(--text3);font-size:12px;text-align:center">Aucun thème</div>'; return; }

  list.innerHTML=sorted.map(([name,n])=>{
    const pct=n/total*100;
    const dot=pct>=10?'dot-high':pct>=3?'dot-mid':'dot-low';
    const isSel=selectedThemes.has(name);
    const isAct=activeTheme===name;
    if (appMode==='multi') {
      return `<button class="theme-btn ${isSel?'selected':''}" onclick="toggleThemeSelect('${name.replace(/'/g,"\\'")}')">
        <div class="chk">${isSel?'✓':''}</div>
        <div class="dot ${dot}"></div>
        <span>${name}</span>
        <span class="count">${n}</span>
      </button>`;
    } else {
      return `<button class="theme-btn ${isAct?'active':''}" onclick="showTheme('${name.replace(/'/g,"\\'")}');closeSidebarOnMobile()">
        <div class="dot ${dot}"></div>
        <span>${name}</span>
        <span class="count">${n}</span>
      </button>`;
    }
  }).join('');
}

// ── Multi-sélection ───────────────────────────────────────────────────────────
function toggleThemeSelect(name) {
  if (selectedThemes.has(name)) selectedThemes.delete(name);
  else selectedThemes.add(name);
  updateMultiBar();
  buildThemeList();
}

function clearSelection() {
  selectedThemes.clear();
  updateMultiBar();
  buildThemeList();
}

function updateMultiBar() {
  const n=selectedThemes.size;
  document.getElementById('multi-count').textContent=`${n} thème${n>1?'s':''} sélectionné${n>1?'s':''}`;
  document.getElementById('btn-compare').disabled=(n<1);
  const chips=[...selectedThemes].map((t,i)=>`
    <span class="sel-chip" style="background:${COLORS[i%COLORS.length]}">
      ${t}<button onclick="toggleThemeSelect('${t.replace(/'/g,"\\'")}')">×</button>
    </span>`).join('');
  document.getElementById('selected-chips').innerHTML=chips;
}

// ── Vue multi-thèmes ──────────────────────────────────────────────────────────
function showMulti() {
  if (selectedThemes.size===0) return;
  closeSidebarOnMobile();
  const themes=[...selectedThemes];
  const docs=getFilteredDocs();
  const docResults=[];

  docs.forEach(doc=>{
    const themeMap={};
    themes.forEach(t=>themeMap[t]={});

    doc.parties.forEach(p=>p.questions.forEach(q=>{
      const qnum=normalizeQnum(q.numero||'');
      (q.mots_cles||[]).forEach(mk=>{
        const {main,sub}=parseTheme(mk.theme);
        if (!themeMap[main]) return;
        const s=sub||'(général)';
        if (!themeMap[main][s]) themeMap[main][s]=[];
        if (!themeMap[main][s].includes(qnum)) themeMap[main][s].push(qnum);
      });
    }));

    const perTheme={};
    let total=0;
    themes.forEach(t=>{
      const n=Object.values(themeMap[t]).flat().length;
      perTheme[t]={subMap:themeMap[t],count:n};
      total+=n;
    });

    if (total>0) docResults.push({doc,perTheme,total});
  });

  docResults.sort((a,b)=>b.total-a.total);
  const maxTotal=docResults[0]?.total||1;
  const maxPerTheme={};
  themes.forEach(t=>{ maxPerTheme[t]=Math.max(...docResults.map(r=>r.perTheme[t].count),1); });

  document.getElementById('main').innerHTML=`
    <div class="page-header">
      <h1>Comparaison — ${themes.length} thème${themes.length>1?'s':''}</h1>
      <p>${docResults.length} sujets couvrent au moins un thème sélectionné · triés par score total</p>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      ${themes.map((t,i)=>`<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:99px;font-size:12px;font-weight:500;background:${COLORS[i%COLORS.length]}20;color:${COLORS[i%COLORS.length]};border:1px solid ${COLORS[i%COLORS.length]}40">
        <span style="width:8px;height:8px;border-radius:50%;background:${COLORS[i%COLORS.length]};display:inline-block"></span>${t}
      </span>`).join('')}
    </div>
    <div class="results-header">
      <div class="results-count">${docResults.length} sujets</div>
      <select class="sort-select" id="sort-sel" onchange="reSortMulti()">
        <option value="total">Score total d'abord</option>
        <option value="year-desc">Année décroissante</option>
        <option value="year-asc">Année croissante</option>
      </select>
    </div>
    <div id="cards-container">${renderMultiCards(docResults,maxTotal,themes,maxPerTheme)}</div>
  `;
  window._multiResults=docResults;
  window._maxTotal=maxTotal;
  window._multiThemes=themes;
  window._maxPerTheme=maxPerTheme;
}

function renderMultiCards(results,maxTotal,themes,maxPerTheme) {
  return results.map((r,i)=>{
    const {doc,perTheme,total}=r;
    const pdfUrl=findPdfUrl(doc);
    const pdfBtn=pdfUrl
      ?`<button class="btn-pdf" onclick="openPdf(event,'${pdfUrl}','${doc.label}')">📄 PDF</button>`
      :`<span class="btn-pdf missing">📄 PDF</span>`;

    const scoreRows=themes.map((t,ti)=>{
      const n=perTheme[t].count;
      const pct=n>0?Math.round(n/maxPerTheme[t]*100):0;
      const color=COLORS[ti%COLORS.length];
      return `<div class="score-row">
        <span class="score-theme-name" title="${t}" style="color:${color}">${t.split(' ').slice(0,2).join(' ')}</span>
        <div class="score-bar-bg"><div class="score-bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <span style="font-family:var(--mono);font-size:11px;color:${n>0?color:'var(--text3)'};min-width:22px;text-align:right">${n>0?n+'q':'-'}</span>
      </div>`;
    }).join('');

    const bodyContent=themes.map((t,ti)=>{
      const {subMap,count}=perTheme[t];
      if (count===0) return '';
      const color=COLORS[ti%COLORS.length];
      const subBlocks=Object.entries(subMap).filter(([,qs])=>qs.length>0).sort((a,b)=>b[1].length-a[1].length).map(([s,qs])=>`
        <div class="sub-block">
          <div class="sub-block-title">${s}</div>
          <div class="q-pills">${qs.map(q=>`<span class="q-pill">${q}</span>`).join('')}</div>
        </div>`).join('');
      return `<div class="theme-section-title" style="color:${color}">● ${t}</div>${subBlocks}`;
    }).join('');

    return `<div class="annale-card" id="mcard-${i}">
      <div class="annale-header" onclick="toggleCard('mcard-${i}')">
        <span class="annale-rank">#${i+1}</span>
        <span class="annale-name">${doc.label}</span>
        <div class="annale-meta">
          <span class="tag tag-bank">${doc.concours}</span>
          <span class="tag tag-fil">${doc.filiere}</span>
          <span class="tag tag-year">${doc.date}</span>
        </div>
        ${pdfBtn}
        <div class="score-col">${scoreRows}</div>
        <div style="text-align:right;min-width:36px">
          <div class="score-total">${total}<span class="q-label">q</span></div>
        </div>
      </div>
      <div class="annale-body" id="body-mcard-${i}">${bodyContent}</div>
    </div>`;
  }).join('');
}

function reSortMulti() {
  const mode=document.getElementById('sort-sel').value;
  let sorted=[...window._multiResults];
  if (mode==='year-desc') sorted.sort((a,b)=>b.doc.date-a.doc.date);
  else if (mode==='year-asc') sorted.sort((a,b)=>a.doc.date-b.doc.date);
  else sorted.sort((a,b)=>b.total-a.total);
  window._multiResults=sorted;
  document.getElementById('cards-container').innerHTML=renderMultiCards(sorted,window._maxTotal,window._multiThemes,window._maxPerTheme);
}

// ── Vue thème unique ──────────────────────────────────────────────────────────
function showTheme(theme) {
  activeTheme=theme; activeSubs.clear();
  document.querySelectorAll('.theme-btn').forEach(b=>b.classList.toggle('active',b.querySelector('span:not(.count)')?.textContent===theme));
  const docs=getFilteredDocs(), subCounts={}, docResults=[];
  docs.forEach(doc=>{
    const subMap={};
    doc.parties.forEach(p=>p.questions.forEach(q=>{
      const qnum=normalizeQnum(q.numero||'');
      (q.mots_cles||[]).forEach(mk=>{
        const {main,sub}=parseTheme(mk.theme);
        if (main!==theme) return;
        const s=sub||'(général)';
        if (!subMap[s]) subMap[s]=[];
        if (!subMap[s].includes(qnum)) subMap[s].push(qnum);
        subCounts[s]=(subCounts[s]||0)+1;
      });
    }));
    const totalQ=Object.values(subMap).flat().length;
    if (totalQ>0) docResults.push({doc,subMap,totalQ});
  });
  docResults.sort((a,b)=>b.totalQ-a.totalQ);
  const maxQ=docResults[0]?.totalQ||1;
  const subsSorted=Object.entries(subCounts).sort((a,b)=>b[1]-a[1]);
  const totalQuestions=Object.values(subCounts).reduce((a,b)=>a+b,0);

  document.getElementById('main').innerHTML=`
    <div class="page-header">
      <h1>${theme}</h1>
      <p>${docResults.length} sujets · ${totalQuestions} questions au total</p>
    </div>
    ${subsSorted.length>1?`
    <div style="margin-bottom:8px;font-size:12px;color:var(--text2);font-weight:500">Filtrer par sous-thème :</div>
    <div class="subtheme-bar">
      ${subsSorted.map(([s,n])=>`<button class="sub-chip" onclick="toggleSub(this,'${s.replace(/'/g,"\\'")}')">
        ${s}<span class="n">${n}</span></button>`).join('')}
    </div>`:''}
    <div class="results-header">
      <div class="results-count" id="res-count">${docResults.length} sujets</div>
      <select class="sort-select" id="sort-sel" onchange="reSort()">
        <option value="count">Plus de questions d'abord</option>
        <option value="year-desc">Année décroissante</option>
        <option value="year-asc">Année croissante</option>
      </select>
    </div>
    <div id="cards-container">${renderCards(docResults,maxQ)}</div>`;
  window._docResults=docResults; window._maxQ=maxQ;
}

function renderCards(results,maxQ,filterSubs) {
  let filtered=results;
  if (filterSubs&&filterSubs.size>0) filtered=results.filter(r=>[...filterSubs].some(s=>r.subMap[s]));
  if (!filtered.length) return '<div style="padding:40px;text-align:center;color:var(--text3)">Aucun sujet.</div>';
  const rc=document.getElementById('res-count');
  if (rc) rc.textContent=`${filtered.length} sujet${filtered.length>1?'s':''}`;
  return filtered.map((r,i)=>{
    const {doc,subMap,totalQ}=r;
    const pct=Math.round(totalQ/maxQ*100);
    const pdfUrl=findPdfUrl(doc);
    const pdfBtn=pdfUrl?`<button class="btn-pdf" onclick="openPdf(event,'${pdfUrl}','${doc.label}')">📄 PDF</button>`:`<span class="btn-pdf missing">📄 PDF</span>`;
    const subsToShow=filterSubs&&filterSubs.size>0?Object.entries(subMap).filter(([s])=>filterSubs.has(s)):Object.entries(subMap);
    const subBlocks=subsToShow.sort((a,b)=>b[1].length-a[1].length).map(([s,qs])=>`
      <div class="sub-block">
        <div class="sub-block-title">${s}</div>
        <div class="q-pills">${qs.map(q=>`<span class="q-pill">${q}</span>`).join('')}</div>
      </div>`).join('');
    return `<div class="annale-card" id="card-${i}">
      <div class="annale-header" onclick="toggleCard('card-${i}')">
        <span class="annale-rank">#${i+1}</span>
        <span class="annale-name">${doc.label}</span>
        <div class="annale-meta">
          <span class="tag tag-bank">${doc.concours}</span>
          <span class="tag tag-fil">${doc.filiere}</span>
          <span class="tag tag-year">${doc.date}</span>
        </div>
        ${pdfBtn}
        <div style="text-align:right;min-width:60px">
          <div class="q-count">${totalQ}<span class="q-label"> q.</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
      </div>
      <div class="annale-body" id="body-card-${i}">${subBlocks}</div>
    </div>`;
  }).join('');
}

function toggleCard(id) { document.getElementById('body-'+id).classList.toggle('open'); }

function toggleSub(btn,sub) {
  btn.classList.toggle('active');
  activeSubs.has(sub)?activeSubs.delete(sub):activeSubs.add(sub);
  document.getElementById('cards-container').innerHTML=renderCards(window._docResults,window._maxQ,activeSubs);
}

function reSort() {
  const mode=document.getElementById('sort-sel').value;
  let sorted=[...window._docResults];
  if (mode==='year-desc') sorted.sort((a,b)=>b.doc.date-a.doc.date);
  else if (mode==='year-asc') sorted.sort((a,b)=>a.doc.date-b.doc.date);
  else sorted.sort((a,b)=>b.totalQ-a.totalQ);
  window._docResults=sorted;
  document.getElementById('cards-container').innerHTML=renderCards(sorted,window._maxQ,activeSubs);
}

// ── PDF ───────────────────────────────────────────────────────────────────────
function openPdf(e,url,label) {
  e.stopPropagation();
  document.getElementById('pdf-modal-title').textContent=label;
  document.getElementById('pdf-frame').src=url;
  document.getElementById('pdf-modal').classList.add('open');
}
function closePdf() {
  document.getElementById('pdf-modal').classList.remove('open');
  document.getElementById('pdf-frame').src='';
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closePdf(); });
