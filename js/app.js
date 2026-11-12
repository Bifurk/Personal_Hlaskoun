const MODES = [
  {id:"spell", icon:"🤖", label:"Slož slovo"},
  {id:"guess", icon:"👂", label:"Najdi hlásku"},
  {id:"write", icon:"✏️", label:"Napiš"},
  {id:"read",  icon:"📖", label:"Přečti"}];

/* ---------- storage ---------- */
const store = {
  get(k,d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
};
let settings = Object.assign({gap:450, assim:true, letters:false, lower:false, voice:"device"}, store.get("hl-settings",{}));
let progress = store.get("hl-progress",{});
let state = Object.assign({level:1, mode:"spell"}, store.get("hl-state",{}));
const saveAll = ()=>{ store.set("hl-settings",settings); store.set("hl-progress",progress); store.set("hl-state",{level:state.level,mode:state.mode}); };
const circled = lv => new Set(progress[lv]||[]);
function setCircle(lv,w,on){ const s=circled(lv); on?s.add(w):s.delete(w); progress[lv]=[...s]; saveAll(); renderLevels(); }

/* ---------- phonetics ---------- */
const HARD = new Set(["KAPITÁN","NIKL"]);
const SOFTEN = {d:"ď",t:"ť",n:"ň"};
const VOICED = {b:"p",d:"t","ď":"ť",g:"k",v:"f",z:"s","ž":"š",h:"ch"};
const VOICELESS = {p:"b",t:"d","ť":"ď",k:"g",s:"z","š":"ž",ch:"h"};   // f→v deliberately left out
const SOUND = {y:"i","ý":"í","ů":"ú","ě":"e"};
function spell(W){
  const w = W.toLowerCase(), out=[];
  for(let i=0;i<w.length;i++){
    const c=w[i], n=w[i+1];
    if(c==="c" && n==="h"){ out.push("ch"); i++; continue; }
    if(SOFTEN[c] && !HARD.has(W) && (n==="ě"||n==="i"||n==="í")){ out.push(SOFTEN[c]); if(n==="ě"){ out.push("e"); i++; } continue; }
    if("bpvf".includes(c) && n==="ě"){ out.push(c,"j","e"); i++; continue; }
    if(c==="m" && n==="ě"){ out.push("m","ň","e"); i++; continue; }
    out.push(c);
  }
  if(settings.assim){
    let next="voiceless"; // word end behaves as voiceless
    for(let i=out.length-1;i>=0;i--){
      let t=out[i];
      const isVd = t in VOICED, isVl = t in VOICELESS || t==="f" || t==="c" || t==="č";
      if(isVd && next==="voiceless") t = out[i] = VOICED[t];
      else if((t in VOICELESS) && next==="voiced") t = out[i] = VOICELESS[t];
      if(t in VOICED) next = (t==="v") ? "son" : "voiced";
      else if(t in VOICELESS || t==="f" || t==="c" || t==="č") next="voiceless";
      else next="son";
    }
  }
  return out.map(d=>({d, s:SOUND[d]||d}));
}
function letters(W){ // written letters, CH as one
  const r=[]; for(let i=0;i<W.length;i++){ if(W[i]==="C"&&W[i+1]==="H"){r.push("CH");i++;} else r.push(W[i]); } return r;
}
const cs = s => settings.lower ? s.toLowerCase() : s.toUpperCase();

/* ---------- audio ---------- */
let ctx=null; const buf={}, REC={};
const AUDIO_DIRS = {w:"words", p:"phones", x:"phrases"};
const audioUrl = key => `audio/${AUDIO_DIRS[key[0]]}/${encodeURIComponent(key.slice(2))}.ogg`;
async function fetchAudio(key){
  const r = await fetch(audioUrl(key));
  if(!r.ok) throw new Error("audio " + key + " " + r.status);
  return ctx.decodeAudioData(await r.arrayBuffer());
}
async function load(key){
  if(buf[key]) return buf[key];
  if(!AUDIO_KEYS.has(key)) return null;
  try{ buf[key] = await fetchAudio(key); }catch(e){ return null; }
  return buf[key];
}
let playToken=0, talkers=0;
function talk(on){ talkers=Math.max(0,talkers+(on?1:-1)); robot.classList.toggle("talking",talkers>0); }
function playBuf(b){ return new Promise(res=>{ const s=ctx.createBufferSource(); s.buffer=b; s.connect(ctx.destination);
  talk(true); s.onended=()=>{ talk(false); res(); }; s.start(); }); }

/* device voice (Google TTS on Android) for whole words */
let csVoice=null;
function pickVoice(){ const v=(window.speechSynthesis&&speechSynthesis.getVoices())||[];
  csVoice = v.find(x=>/^cs/i.test(x.lang) && /google/i.test(x.name)) || v.find(x=>/^cs/i.test(x.lang)) || null; }
if(window.speechSynthesis){ pickVoice(); speechSynthesis.onvoiceschanged=pickVoice; }
function ttsSay(text){ return new Promise(res=>{
  const u=new SpeechSynthesisUtterance(text); u.lang="cs-CZ"; u.voice=csVoice; u.rate=0.85;
  let done=false; const fin=()=>{ if(done) return; done=true; talk(false); res(); };
  u.onend=fin; u.onerror=fin; setTimeout(fin, 4000);
  speechSynthesis.cancel(); talk(true); speechSynthesis.speak(u); }); }
const useDevice = ()=> settings.voice!=="robot" && csVoice;

async function play(key){
  if(!ctx) return;
  if(key.startsWith("p_")){ const b=REC[key.slice(2)]; if(b) return playBuf(b); return; }
  if(OWNV.has(key)){ const b=await load(key); if(b) return playBuf(b); }
  if(useDevice()){
    const text = key.startsWith("w_") ? key.slice(2).toLowerCase() : PHR[key.slice(2)];
    if(text) return ttsSay(text);
  }
  const b = await load(key); if(b) return playBuf(b);
}
const PHR={ok1:"správně!",ok2:"výborně!",ok3:"super!",no:"zkus to znovu",done:"hotovo, dneska stačí"};
const wait = ms => new Promise(r=>setTimeout(r,ms));
async function sayWord(W){ playToken++; await play("w_"+W); }
const hasAllRec = W => spell(W).every(p=>REC[p.s]);
async function spellOut(W, onStep){
  const my=++playToken, ph=spell(W);
  for(let i=0;i<ph.length;i++){
    if(my!==playToken) return false;
    onStep && onStep(i);
    if(REC[ph[i].s]) { await play("p_"+ph[i].s); await wait(settings.gap); }
    else await wait(settings.gap+500);
  }
  onStep && onStep(-1);
  return my===playToken;
}
const praise = ()=>play("x_ok"+(1+Math.floor(Math.random()*3)));

/* ---------- recorded sounds (parent's voice) ---------- */
const PHONES=[["a","máma"],["á","káva"],["e","pes"],["é","mléko"],["i","ryba"],["í","síla"],["o","oko"],["ó","gól"],["u","ucho"],["ú","úl"],
 ["m","máma"],["n","nos"],["ň","kůň"],["l","les"],["r","ruka"],["ř","řeka"],["s","sova"],["z","zima"],["š","šála"],["ž","žába"],
 ["c","cukr"],["č","čáp"],["j","jahoda"],["v","voda"],["f","fén"],["h","had"],["ch","chata"],
 ["p","pes"],["b","bota"],["t","táta"],["d","dům"],["ť","ťuk"],["ď","ďábel"],["k","kos"],["g","gól"]];
let dbp=null;
function db(){ if(!dbp) dbp=new Promise((res,rej)=>{ const r=indexedDB.open("hlaskoun",1);
  r.onupgradeneeded=()=>r.result.createObjectStore("rec"); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); return dbp; }
async function dbOp(mode,fn){ const d=await db(); return new Promise((res,rej)=>{ const tx=d.transaction("rec",mode); const r=fn(tx.objectStore("rec")); tx.oncomplete=()=>res(r&&r.result); tx.onerror=()=>rej(tx.error); }); }
function trim(b){
  const d=b.getChannelData(0); let peak=0; for(const x of d) peak=Math.max(peak,Math.abs(x));
  if(peak<0.01) return null;
  const th=peak*0.08; let s=0,e=d.length-1; while(s<e&&Math.abs(d[s])<th)s++; while(e>s&&Math.abs(d[e])<th)e--;
  const pad=Math.floor(b.sampleRate*0.03); s=Math.max(0,s-pad); e=Math.min(d.length,e+pad);
  const out=ctx.createBuffer(1,e-s,b.sampleRate), o=out.getChannelData(0), g=0.9/peak;
  for(let i=0;i<e-s;i++) o[i]=d[s+i]*g;
  const f=Math.min(200,o.length); for(let i=0;i<f;i++){ o[i]*=i/f; o[o.length-1-i]*=i/f; }
  return out;
}
async function decodeRec(blob){ const b=await ctx.decodeAudioData(await blob.arrayBuffer()); return trim(b); }
async function loadRecs(){
  try{ for(const [k] of PHONES){ const blob=await dbOp("readonly",s=>s.get(k)); if(blob){ const b=await decodeRec(blob); if(b) REC[k]=b; } } }catch(e){}
  await Promise.all(PHONES.filter(([k])=>!REC[k] && AUDIO_KEYS.has("p_"+k))
    .map(async([k])=>{ try{ REC[k]=await fetchAudio("p_"+k); }catch(e){} }));
}
/* ---------- timer ---------- */
let secs=300, tick=null, doneSaid=false;
function startTimer(){ if(tick) return; tick=setInterval(()=>{ secs--; const el=$("timer");
  if(secs>=0){ el.textContent=Math.floor(secs/60)+":"+String(secs%60).padStart(2,"0"); }
  else { el.textContent="hotovo"; el.classList.add("over"); if(!doneSaid){ doneSaid=true; play("x_done"); } clearInterval(tick); }
},1000); }

/* ---------- word queue ---------- */
let queue=[], word=null;
function nextWord(){
  if(!queue.length){
    const all=LEVELS[state.level], c=circled(state.level);
    const fresh=all.filter(w=>!c.has(w)), rest=all.filter(w=>c.has(w));
    queue=[...shuffle(fresh),...shuffle(rest)];
    if(word && queue[0]===word && queue.length>1) queue.push(queue.shift());
  }
  word=queue.shift(); render();
}
function shuffle(a){ a=[...a]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

/* ---------- ui helpers ---------- */
const $=id=>document.getElementById(id);
const robot=$("robot"), screen=$("screen"), panel=$("panel"), actions=$("actions");
function h(tag,attrs={},...kids){ const e=document.createElement(tag);
  for(const[k,v] of Object.entries(attrs)){ if(k.startsWith("on")) e.addEventListener(k.slice(2),v); else if(k==="class") e.className=v; else e.setAttribute(k,v); }
  for(const k of kids.flat()) if(k!=null) e.append(k.nodeType?k:document.createTextNode(k)); return e; }
function mood(m){ robot.classList.remove("happy","sad","shake"); void robot.offsetWidth; if(m==="happy") robot.classList.add("happy"); if(m==="sad") robot.classList.add("sad","shake"); }
function setActions(...btns){ actions.replaceChildren(...btns); }
const btn=(label,cls,fn)=>h("button",{class:"btn "+(cls||""),onclick:fn},label);

function renderLevels(){
  $("levels").replaceChildren(...Object.keys(LEVELS).map(lv=>{
    const pct=Math.round(100*circled(lv).size/LEVELS[lv].length);
    return h("button",{class:"lv","aria-pressed":String(+lv===state.level),"aria-label":`Úroveň ${lv}, ${pct} % zakroužkováno`,onclick:()=>{ state.level=+lv; queue=[]; saveAll(); renderLevels(); nextWord(); }},
      lv, h("small",{},h("i",{style:`width:${pct}%`})));
  }));
  const c=circled(state.level).size, n=LEVELS[state.level].length;
  $("lvnote").textContent=`${NOTES[state.level]} · zakroužkováno ${c} z ${n}`;
}
function renderModes(){
  $("modes").replaceChildren(...MODES.map(m=>h("button",{class:"mode","aria-pressed":String(m.id===state.mode),onclick:()=>{ state.mode=m.id; saveAll(); renderModes(); render(); }},h("span",{"aria-hidden":"true"},m.icon),m.label)));
}

/* ---------- modes ---------- */
function render(){ playToken++; mood(); ({spell:rSpell,guess:rGuess,write:rWrite,read:rRead})[state.mode](); }

function rSpell(){
  const ph=spell(word); let revealed=false;
  const own=!hasAllRec(word);
  const tiles=ph.map(p=>h("div",{class:"tile"},(settings.letters||own)?cs(p.d):"•"));
  const wd=h("div",{class:"word hidden"},"?".repeat(Math.min(word.length,6)));
  screen.replaceChildren(h("div",{class:"tiles"},tiles), wd);
  const go=()=>spellOut(word,i=>tiles.forEach((t,k)=>{ t.classList.toggle("on",k===i); if(k===i) t.classList.add("seen"); }));
  const reveal=()=>{ revealed=true; wd.textContent=cs(word); wd.classList.remove("hidden"); ph.forEach((p,k)=>tiles[k].textContent=cs(p.d)); sayWord(word); };
  panel.replaceChildren(own
    ? h("div",{class:"tip"},"Hlásky zatím nejsou namluvené, hláskujte proto podle displeje sami: robot vám ukazuje tempo. ",h("button",{class:"link",onclick:openRec},"Namluvit hlásky"))
    : h("p",{class:"tip"},"Robot slovo vyhláskuje vaším hlasem, dítě ho řekne celé. Když neví, dejte nápovědu (třeba „mám to na obličeji“) a nechte hláskovat znovu."));
  setActions(btn("🔁 Hláskuj","",go), btn("👀 Ukázat","",reveal),
    btn("✓ Složil(a)","good",()=>{ setCircle(state.level,word,true); if(!revealed) reveal(); mood("happy"); praise(); setTimeout(nextWord,1600); }),
    btn("Další ›","main",nextWord));
  setTimeout(go,350);
}

function rGuess(){
  const ph=spell(word).map(p=>p.d);
  const kinds=["first","last"]; if(ph.length>=3) kinds.push("mid");
  const kind=kinds[Math.floor(Math.random()*kinds.length)];
  let target, q;
  if(kind==="first"){ target=ph[0]; q="Jakou hláskou slovo začíná?"; }
  else if(kind==="last"){ target=ph[ph.length-1]; q="Jakou hláskou slovo končí?"; }
  else { const mids=ph.slice(1,-1); target=mids[Math.floor(Math.random()*mids.length)]; q="Která hláska je uvnitř slova?"; }
  const pool=["a","e","i","o","u","á","í","m","n","l","s","p","t","k","r","v","d","b","j","h","z","š","ž","č","ř","c","ch","ň","ť","ď","f"]
    .filter(x=>x!==target && (kind==="mid" ? !ph.includes(x) : (x!==target)) && !(kind==="first"&&x===ph[0]) && !(kind==="last"&&x===ph[ph.length-1]));
  const opts=shuffle([target,...shuffle(pool).slice(0,3)]);
  const wd=h("div",{class:"word hidden"},"?".repeat(Math.min(word.length,6)));
  screen.replaceChildren(wd, h("div",{class:"hint"},"Poslouchej, co robot říká."));
  let tries=0, done=false;
  const ob=opts.map(o=>h("button",{class:"opt","aria-label":"hláska "+o,onclick:async e=>{
    if(done) return; tries++;
    if(o===target){ done=true; e.currentTarget.classList.add("ok"); mood("happy"); wd.textContent=cs(word); wd.classList.remove("hidden");
      if(tries===1) setCircle(state.level,word,true);
      await play("p_"+(SOUND[o]||o)); await praise(); }
    else { e.currentTarget.classList.add("bad"); e.currentTarget.disabled=true; mood("sad"); await play("p_"+(SOUND[o]||o)); }
  }},cs(o)));
  panel.replaceChildren(h("p",{class:"q"},q), h("div",{class:"opts"},ob),
    h("p",{class:"tip"},"Klepnutím na hlásku ji robot zahraje. Když je dítě bezradné, nechte slovo vyhláskovat."));
  setActions(btn("🔊 Řekni slovo","",()=>sayWord(word)), btn("🔁 Hláskuj","",()=>spellOut(word)), btn("Další ›","main",nextWord));
  setTimeout(()=>sayWord(word),300);
}

function rWrite(){
  const L=letters(word), typed=[];
  const extraPool=["A","E","I","O","U","Í","Á","M","L","S","T","K","P","R","N","V","Y","D","Z","J"].filter(x=>!L.includes(x));
  const bank=shuffle([...L.map((l,i)=>({l,i})), ...shuffle(extraPool).slice(0,2).map((l,i)=>({l,i:100+i}))]);
  const slots=L.map(()=>h("div",{class:"slot"}," "));
  const wd=h("div",{class:"word hidden"},"✏️");
  screen.replaceChildren(wd, h("div",{class:"hint"},"Robot řekne slovo. Napiš ho z písmen dole, nebo na papír."));
  let keys;
  const paint=()=>{ slots.forEach((s,i)=>{ s.textContent=typed[i]?cs(typed[i].l):" "; s.className="slot"+(typed[i]?" f":""); });
    keys.forEach(k=>k.disabled=typed.some(t=>t.i===+k.dataset.i)); };
  const check=()=>{
    const ok=typed.every((t,i)=>t.l===L[i]);
    typed.forEach((t,i)=>slots[i].classList.add(t.l===L[i]?"ok":"bad"));
    if(ok){ mood("happy"); setCircle(state.level,word,true); wd.textContent=cs(word); wd.classList.remove("hidden"); praise(); }
    else { mood("sad"); play("x_no"); setTimeout(()=>{ for(let i=typed.length-1;i>=0;i--) if(typed[i].l!==L[i]) typed.splice(i); paint(); },1100); }
  };
  keys=bank.map(b=>h("button",{class:"key","data-i":b.i,onclick:()=>{ if(typed.length>=L.length) return; typed.push(b); paint(); play("p_"+((spell(b.l)[0]||{}).s)); if(typed.length===L.length) setTimeout(check,350); }},cs(b.l)));
  panel.replaceChildren(h("div",{class:"slots",onclick:()=>{ typed.pop(); paint(); }},slots), h("div",{class:"bank"},keys),
    h("p",{class:"tip"},"Klepnutím na řádek s písmeny smažete poslední písmeno."));
  paint();
  setActions(btn("🔊 Řekni slovo","",()=>sayWord(word)), btn("👀 Ukázat","",()=>{ wd.textContent=cs(word); wd.classList.remove("hidden"); }), btn("Další ›","main",nextWord));
  setTimeout(()=>sayWord(word),300);
}

function rRead(){
  const wd=h("div",{class:"word"},cs(word));
  screen.replaceChildren(wd);
  panel.replaceChildren(h("p",{class:"tip"},"Dítě slovo přečte nahlas. Nezná písmeno? Ať se zeptá – to je v pořádku. Robot pak může slovo přečíst pro kontrolu."));
  setActions(btn("🔊 Přečti","",()=>sayWord(word)), btn("🔁 Hláskuj","",()=>spellOut(word)),
    btn("✓ Přečetl(a)","good",()=>{ setCircle(state.level,word,true); mood("happy"); praise(); setTimeout(nextWord,1300); }),
    btn("Další ›","main",nextWord));
}

/* ---------- dialogs ---------- */
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>b.closest("dialog").close()));
function renderGrid(){
  const c=circled(state.level);
  $("listTitle").textContent=`Úroveň ${state.level} · ${c.size} z ${LEVELS[state.level].length}`;
  $("grid").replaceChildren(...LEVELS[state.level].map(w=>h("button",{class:"gw"+(c.has(w)?" c":""),onclick:()=>{ setCircle(state.level,w,!circled(state.level).has(w)); renderGrid(); }},cs(w))));
}
$("openList").onclick=()=>{ renderGrid(); $("dlgList").showModal(); };
$("resetLv").onclick=()=>{ if(confirm("Smazat všechny kroužky v této úrovni?")){ progress[state.level]=[]; saveAll(); renderLevels(); renderGrid(); } };
$("openSet").onclick=()=>{ $("voice").value=settings.voice; $("voiceNote").textContent=csVoice?"Hlas telefonu zní přirozeně":"Telefon nemá český hlas, používá se robot"; $("gap").value=settings.gap; $("assim").checked=settings.assim; $("letters").checked=settings.letters; $("lower").checked=settings.lower; $("dlgSet").showModal(); };
$("gap").oninput=e=>{ settings.gap=+e.target.value; saveAll(); };
["assim","letters","lower"].forEach(k=>$(k).onchange=e=>{ settings[k]=e.target.checked; saveAll(); });
$("dlgSet").addEventListener("close",()=>{ renderGrid(); render(); });

/* ---------- recording dialog ---------- */
let stream=null, activeRec=null;
function stopRec(){ if(!activeRec) return; clearTimeout(activeRec.timer); const {mr}=activeRec; activeRec=null; if(mr.state==="recording") setTimeout(()=>mr.stop(),150); }
async function getMic(){
  if(stream) return stream;
  if(!navigator.mediaDevices||!window.MediaRecorder) throw new Error("nosupport");
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
  return stream;
}
function recMsg(t){ const m=$("recMsg"); m.hidden=!t; m.textContent=t||""; }
function renderRec(){
  $("recGrid").replaceChildren(...PHONES.map(([k,ex])=>{
    const b=h("button",{class:"rk"+(REC[k]?" has":""),"aria-label":`hláska ${k}, jako ${ex}`},h("b",{},cs(k)),h("span",{},ex));
    b.addEventListener("click",async()=>{
      if(activeRec){ const same=activeRec.k===k; stopRec(); if(same) return; }
      recMsg("Připravuji mikrofon…");
      let s;
      try{ if(ctx.state==="suspended") await ctx.resume(); s=await getMic(); }
      catch(err){
        if(err&&err.message==="nosupport") recMsg("Tento prohlížeč neumí nahrávat. Otevřete aplikaci v Chromu.");
        else if(err&&(err.name==="NotAllowedError"||err.name==="SecurityError")) recMsg("Mikrofon je zablokovaný. V Chromu ťukněte na ikonu vlevo od adresy → Oprávnění → Mikrofon → Povolit a stránku obnovte. Pokud to nepomůže, namluvte hlásky do jedné nahrávky a pošlete ji do chatu.");
        else recMsg("Mikrofon se nepodařilo spustit ("+((err&&err.name)||"chyba")+"). Zkuste stránku obnovit.");
        return;
      }
      const chunks=[]; const mr=new MediaRecorder(s);
      mr.ondataavailable=ev=>{ if(ev.data&&ev.data.size) chunks.push(ev.data); };
      mr.onstop=async()=>{ b.classList.remove("rec");
        const blob=new Blob(chunks,{type:mr.mimeType||"audio/webm"});
        try{ const buf=await decodeRec(blob); if(!buf){ recMsg("Nic nebylo slyšet. Mluvte blíž k telefonu a zkuste to znovu."); return; }
          REC[k]=buf; await dbOp("readwrite",st=>st.put(blob,k)); b.classList.add("has");
          recMsg(`Uloženo: ${cs(k)}. Namluveno ${PHONES.filter(([q])=>REC[q]).length} z ${PHONES.length}.`); playBuf(buf); }
        catch(err){ recMsg("Nahrávku se nepodařilo zpracovat, zkuste to znovu."); } };
      mr.start(); b.classList.add("rec"); recMsg(`Nahrávám ${cs(k)}… řekněte hlásku teď.`);
      activeRec={k,mr,timer:setTimeout(stopRec,1800)};
    });
    b.addEventListener("contextmenu",e=>e.preventDefault());
    return b;
  }));
  const n=PHONES.filter(([k])=>REC[k]).length;
  if(!$("recMsg").textContent) recMsg(n?`Namluveno ${n} z ${PHONES.length} hlásek.`:"");
}
function openRec(){ recMsg(""); renderRec(); $("dlgRec").showModal(); }
$("openRec").onclick=openRec;
$("recTest").onclick=()=>spellOut(word||"NOS");
$("dlgRec").addEventListener("close",()=>{ stopRec(); if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } render(); });
$("voice").onchange=e=>{ settings.voice=e.target.value; saveAll(); };

/* ---------- start ---------- */
$("go").onclick=async()=>{
  const AC=window.AudioContext||window.webkitAudioContext;
  ctx=new AC(); if(ctx.state==="suspended") await ctx.resume();
  await loadRecs(); pickVoice();
  $("start").remove(); startTimer(); nextWord();
  if(!PHONES.some(([k])=>REC[k])) setTimeout(openRec,400);
};
renderLevels(); renderModes();
