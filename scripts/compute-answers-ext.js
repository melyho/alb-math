const fs = require('fs');
const path = require('path');
function round(v,d=6){ return Math.round(v*Math.pow(10,d))/Math.pow(10,d); }

function readCSV(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = vals[j] ?? '';
    rows.push(row);
  }
  return { headers, rows };
}

function writeCSV(filePath, headers, rows) {
  const esc = s => {
    const v = (s ?? '').toString();
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v;
  };
  const out = [headers.join(',')];
  for (const r of rows) out.push(headers.map(h => esc(r[h])).join(','));
  fs.writeFileSync(filePath, out.join('\n'));
}

function parseCSVLine(line) {
  const res = []; let cur = ''; let q = false;
  for (let i=0;i<line.length;i++){
    const ch=line[i];
    if (ch==='"') { if (q && line[i+1]==='"'){cur+='"'; i++;} else q=!q; }
    else if (ch===',' && !q) { res.push(cur); cur=''; }
    else cur+=ch;
  }
  res.push(cur); return res.map(s=>s.trim());
}

function hasAnswer(row){ return (row.answer && row.answer.trim()) || (row.answerLatex && row.answerLatex.trim()); }

// ---- LaTeX to plain-text helper for backfilling ----
function latexToPlain(s){
  if(!s) return '';
  let t = s;
  t = t.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g,'($1)/($2)');
  t = t.replace(/\\text\{([^}]*)\}/g,'$1');
  t = t.replace(/\\left\s*\(|\\right\s*\)/g,'');
  t = t.replace(/\\cup/g,'U').replace(/\\cap/g,'n');
  t = t.replace(/\\leq/g,'<=').replace(/\\geq/g,'>=').replace(/\\approx/g,'≈');
  t = t.replace(/\\Rightarrow/g,'=>').replace(/\\rightarrow/g,'->');
  t = t.replace(/\\sqrt\{([^}]+)\}/g,'sqrt($1)');
  t = t.replace(/\\ln\s*\(([^)]+)\)/g,'ln($1)').replace(/\\ln\{([^}]+)\}/g,'ln($1)');
  t = t.replace(/\\/g,'');
  t = t.replace(/\s+/g,' ').trim();
  return t;
}

// ---- helpers for math ----
function parseFx(row) {
  const t = (row.questionLatex || row.questionText || '').replace(/\s+/g,'');
  const m = t.match(/f\((x|t)\)=([^,]+)/);
  if (m) return { varName: m[1], expr: normalizeExpr(m[2]) };
  // Fallback: if questionLatex is just an expression in x or t
  const bare = (row.questionLatex||'').replace(/\s+/g,'');
  if (/[xt]/.test(bare) && !/=/.test(bare)) {
    // Choose variable present, prefer x
    const varName = /x/.test(bare) ? 'x' : 't';
    return { varName, expr: normalizeExpr(bare) };
  }
  return null;
}
function normalizeExpr(e){
  let s = e.replace(/\^/g,'**').replace(/\\/g,'');
  // remove LaTeX sizing tokens
  s = s.replace(/left|right/g,'');
  s = s.replace(/\{([^}]+)\}/g,'($1)');
  s = s.replace(/ln\(/g,'Math.log(');
  s = s.replace(/e\*\*\(/g,'Math.exp(');
  return s;
}
function evalExpr(expr, vname, v){
  try{
    let s = expr;
    // Insert multiplication in safe spots (avoid breaking Math.* calls)
    s = s.replace(/(\d)\s*([a-zA-Z(])/g,'$1*$2');
    s = s.replace(/\)\s*([xt])/g,')*$1');
    const f = new Function(vname, `return (${s});`);
    const val = f(v); if (typeof val!== 'number' || Number.isNaN(val)) return null; return val;
  }catch{ return null; }
}
function d1(expr, vname, x, h=1e-5){ const f1=evalExpr(expr,vname,x+h), f2=evalExpr(expr,vname,x-h); if(f1==null||f2==null)return null; return (f1-f2)/(2*h); }
function d2(expr, vname, x, h=1e-4){ const f1=evalExpr(expr,vname,x+h), f0=evalExpr(expr,vname,x), f2v=evalExpr(expr,vname,x-h); if(f1==null||f0==null||f2v==null)return null; return (f1-2*f0+f2v)/(h*h); }

// ---- Topic solvers ----
function solveRelativeExtrema(row){
  const p = parseFx(row); if(!p) return null; const {varName, expr}=p;
  // Try quadratic ax^2+bx+c
  const quad = expr.match(/^([+-]?\d*\.?\d*)\*?x\*\*2([+-]\d*\.?\d*)\*?x([+-]\d*\.?\d+)?$/);
  if (quad){ const a = quad[1]===''||quad[1]==='+'?1:(quad[1]==='-'?-1:parseFloat(quad[1])); const b=parseFloat(quad[2]); const c=quad[3]?parseFloat(quad[3]):0; const xv=-b/(2*a); const yv=evalExpr(expr,varName,xv); const kind=a>0?'relative minimum':'relative maximum'; return {answer:`${kind} at ${varName}=${round(xv)}, f=${round(yv)}`, answerLatex:`${kind} \\text{ at } ${varName}=${round(xv)},\\ f=${round(yv)}`}; }
  // Try cubic ax^3+bx^2+cx+d
  const cubic = expr.match(/^([+-]?\d*\.?\d*)\*?x\*\*3([+-]\d*\.?\d*)\*?x\*\*2([+-]\d*\.?\d*)\*?x([+-]\d*\.?\d+)?$/);
  if (cubic){ const a=cubic[1]===''||cubic[1]==='+'?1:(cubic[1]==='-'?-1:parseFloat(cubic[1])); const b=parseFloat(cubic[2]); const c=parseFloat(cubic[3]); const A=3*a, B=2*b, C=c; const disc=B*B-4*A*C; if(disc<0) return {answer:'No relative extrema', answerLatex:'\\text{No relative extrema}'}; const r1=(-B-Math.sqrt(disc))/(2*A), r2=(-B+Math.sqrt(disc))/(2*A); const s1=d2(expr,varName,r1), s2=d2(expr,varName,r2); const out=[]; const outL=[]; const push=(x0,s)=>{const kind=s>0?'relative minimum':(s<0?'relative maximum':'saddle point'); const y=evalExpr(expr,varName,x0); out.push(`${kind} at ${varName}=${round(x0)}, f=${round(y)}`); outL.push(`${kind} \\text{ at } ${varName}=${round(x0)},\\ f=${round(y)}`);}; push(r1,s1); push(r2,s2); return {answer:out.join('; '), answerLatex: outL.join('; ') } }
  // Numeric search
  const crits=new Set(); for(let x=-5;x<=5;x+=0.5){ const a=x, b=x+0.5; const fa=d1(expr,varName,a), fb=d1(expr,varName,b); if(fa==null||fb==null) continue; if (fa===0) crits.add(round(a)); if(fa*fb<0){ let L=a,R=b; for(let k=0;k<28;k++){ const M=(L+R)/2, fL=d1(expr,varName,L), fM=d1(expr,varName,M); if(fL==null||fM==null) break; if(fL*fM<=0) R=M; else L=M; } crits.add(round((L+R)/2)); } }
  if (crits.size===0) return null; const out=[]; for(const x0 of Array.from(crits).sort((a,b)=>a-b)){ const s=d2(expr,varName,x0); const y=evalExpr(expr,varName,x0); const kind=s>0?'relative minimum':(s<0?'relative maximum':'saddle point'); out.push(`${kind} at ${varName}=${round(x0)}, f=${round(y)}`); } return {answer:out.join('; '), answerLatex: out.join('; ')}
}

function solveAbsoluteExtrema(row){
  const p=parseFx(row); if(!p) return null; const {varName,expr}=p; const t=(row.questionText||'')+(row.questionLatex||''); const m=t.match(/\[\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*\]/); if(!m) return null; const a=parseFloat(m[1]), b=parseFloat(m[2]); const cand=[a,b]; for(let x=a;x<b;x+=(b-a)/20){ const fa=d1(expr,varName,x), fb=d1(expr,varName,x+(b-a)/20); if(fa==null||fb==null) continue; if(fa*fb<0){ let L=x,R=x+(b-a)/20; for(let k=0;k<28;k++){ const M=(L+R)/2, fL=d1(expr,varName,L), fM=d1(expr,varName,M); if(fL==null||fM==null) break; if(fL*fM<=0) R=M; else L=M; } const r=(L+R)/2; if(r>a&&r<b) cand.push(r); } }
  const vals=cand.map(x0=>({x:x0,y:evalExpr(expr,varName,x0)})); const max=vals.reduce((p,c)=>!p||c.y>p.y?c:p,null); const min=vals.reduce((p,c)=>!p||c.y<p.y?c:p,null); return {answer:`Absolute min at ${varName}=${round(min.x)}, f=${round(min.y)}; absolute max at ${varName}=${round(max.x)}, f=${round(max.y)}`, answerLatex:`\\text{min at } ${varName}=${round(min.x)},\\ f=${round(min.y)};\\ \\text{max at } ${varName}=${round(max.x)},\\ f=${round(max.y)}`}
}

function solveConcavity(row){ const p=parseFx(row); if(!p) return null; const {varName,expr}=p; const pts=[-5,-2,-1,-0.5,0,0.5,1,2,5]; const ss=pts.map(x=>({x,s:d2(expr,varName,x)})); const segs=[]; for(let i=1;i<ss.length;i++){ const a=ss[i-1], b=ss[i]; if(a.s!=null&&b.s!=null){ if(a.s>0&&b.s>0) segs.push({a:a.x,b:b.x,sign:'up'}); else if(a.s<0&&b.s<0) segs.push({a:a.x,b:b.x,sign:'down'}); } } const infl=[]; for(let i=1;i<ss.length;i++){ const a=ss[i-1], b=ss[i]; if(a.s!=null&&b.s!=null&&a.s*b.s<0){ let L=a.x,R=b.x; for(let k=0;k<28;k++){ const M=(L+R)/2, sM=d2(expr,varName,M); if(a.s*sM<=0) R=M; else L=M; } infl.push(round((L+R)/2)); } } const up=segs.filter(s=>s.sign==='up').map(s=>`(${s.a}, ${s.b})`).join(' ∪ ')||'none'; const dn=segs.filter(s=>s.sign==='down').map(s=>`(${s.a}, ${s.b})`).join(' ∪ ')||'none'; return {answer:`Concave up on ${up}; concave down on ${dn}; inflection points at ${infl.join(', ')||'none'}`, answerLatex:`\\text{Up on } ${up.replace(/ ∪ /g,' \\cup ')};\\ \\text{Down on } ${dn.replace(/ ∪ /g,' \\cup ')};\\ \\text{Inflection at } ${infl.join(', ')||'none'}`}
}

function parseSimpleNumber(s){ try{ const c=s.replace(/[()]/g,''); if(c.includes('/')){ const [n,d]=c.split('/').map(parseFloat); return n/d; } return parseFloat(c);}catch{ return NaN; } }
function evalExprForVar(expr, varName, varValue){ try{ let s=expr; s=s.replace(/\\left|\\right/g,''); s=s.replace(/\\sqrt\{([^}]+)\}/g,'Math.sqrt($1)').replace(/sqrt\(([^)]+)\)/g,'Math.sqrt($1)'); s=s.replace(/\^/g,'**'); s=s.replace(/(\d)\s*([a-zA-Z])/g,'$1*$2').replace(/\)\s*([a-zA-Z])/g,')*$1').replace(/(\d)\s*\(/g,'$1*('); s=s.replace(/[{}]/g,m=>m==='{'?'(' : ')'); const fn=new Function(varName,`return (${s});`); const val=fn(varValue); if(typeof val!=='number'||Number.isNaN(val)) return null; return val; }catch{ return null; } }

function solveElasticity(row){
  const t=(row.questionText||'')+' '+(row.questionLatex||''); const mP=t.match(/p0\s*=\s*(\d+(?:\.\d+)?)/i); const p0=mP?parseFloat(mP[1]):null; let expr=null; const mEq=t.match(/x\s*=\s*([^;\n]+)/); if(mEq) expr=mEq[1].trim(); if(!expr){ const mLin=t.match(/x\s*\+\s*\(\s*([+-]?\d+(?:\/\d+)?(?:\.\d+)?)\s*\)\s*p\s*([+-]\s*\d+(?:\.\d+)?)\s*=\s*0/)||t.match(/x\s*\+\s*([+-]?\d+(?:\/\d+)?(?:\.\d+)?)\s*p\s*([+-]\s*\d+(?:\.\d+)?)\s*=\s*0/); if(mLin){ const a=parseSimpleNumber(mLin[1]); const b=parseFloat(mLin[2].replace(/\s+/g,'')); expr=`${-a}*p ${b>=0?'+':'-'} ${Math.abs(b)}`; } }
  if(!expr||p0==null) return null; const xOfP=p=>evalExprForVar(expr,'p',p); const dxdp=p=>{ const h=Math.max(1e-5,Math.abs(p)*1e-5); const xp1=xOfP(p+h), xm1=xOfP(p-h); if(xp1==null||xm1==null) return null; return (xp1-xm1)/(2*h); }; let x0=xOfP(p0), dxdp0=dxdp(p0); let E=(x0&&dxdp0!=null)?(-p0/x0)*dxdp0:null; if(E==null){ const mS=expr.match(/sqrt\(([^)]+)\)/)||expr.match(/\\sqrt\{([^}]+)\}/); if(mS){ const inner=mS[1].replace(/\s+/g,''); const js=inner.replace(/p\^2/g,'(p**2)').replace(/\^/g,'**'); try{ const f=new Function('p',`return (${js});`); x0=Math.sqrt(f(p0)); const h=1e-5, g1=f(p0+h), g2=f(p0-h); dxdp0=(g1-g2)/(2*h)/(2*x0); E=(-p0/x0)*dxdp0; }catch{}} }
  if(E==null) return null; const Eval=round(E,6); const aE=Math.abs(Eval); const cls=aE>1?'elastic':(aE<1?'inelastic':'unitary'); const rev=aE>1?'Revenue decreases when price increases.':(aE<1?'Revenue increases when price increases.':'Revenue unchanged for small price changes.'); return {answer:`E(p0) = ${Eval}; classification: ${cls}. ${rev}`, answerLatex:`E(${p0}) = ${Eval}`};
}

function solveEconomicsMarginal(row){ const qL=row.questionLatex||''; const eq = qL.split(';')[0].trim(); const m=eq.match(/C\(x\)\s*=\s*(.+)$/); if(!m) return null; const expr=m[1]; const nums=[...((row.questionText||'').matchAll(/-?\d+(?:\.\d+)?/g))].map(x=>parseFloat(x[0])).slice(0,3); const xvals=nums; const vals=xvals.map(x=>({x, v: round(evalCprimeAt(expr,x),6)})); let trend=''; if(vals.length>=2){ trend=vals[1].v<vals[0].v?'Marginal cost decreases as production increases.':(vals[1].v>vals[0].v?'Marginal cost increases as production increases.':'Marginal cost is constant.'); } const parts=vals.map(({x,v})=>`C'( ${x} ) = ${v}`); return {answer: parts.join('; ') + (trend?`. ${trend}`:''), answerLatex: parts.join(', ')} }

function evalCprimeAt(expr, x){ const terms=expr.replace(/−/g,'-').replace(/\s+/g,'').match(/[+-]?[^+-]+/g)||[]; let val=0; for(const t of terms){ let m=t.match(/^([+-]?\d*\.?\d*)x\^\{?([+-]?\d*\/?\d+)\}?$/); if(m){ const a=m[1]===''||m[1]==='+'?1:(m[1]==='-'?-1:parseFloat(m[1])); const ns=m[2]; const n=ns.includes('/')?(parseFloat(ns.split('/')[0])/parseFloat(ns.split('/')[1])):parseFloat(ns); val+=a*n*Math.pow(x,n-1); continue; } m=t.match(/^([+-]?\d*\.?\d*)x$/); if(m){ const a=m[1]===''||m[1]==='+'?1:(m[1]==='-'?-1:parseFloat(m[1])); val+=a; continue; } m=t.match(/^sqrt\(([-+]?\d*\.?\d*)x([+-]\d*\.?\d+)\)$/)||t.match(/^\\sqrt\{([-+]?\d*\.?\d*)x([+-]\d*\.?\d+)\}$/); if(m){ const a=parseFloat(m[1]||'1'); const b=parseFloat(m[2]||'0'); val+= a/(2*Math.sqrt(a*x+b)); continue; } m=t.match(/^e\^\{([-+]?\d*\.?\d*)x([+-]\d*\.?\d+)\}$/); if(m){ const a=parseFloat(m[1]||'1'); const b=parseFloat(m[2]||'0'); val+= a*Math.exp(a*x+b); continue; } m=t.match(/^\?ln\(x\^2([+-]\d+)\)$/)||t.match(/^\\ln\\left\(x\^2([+-]\d+)\\right\)$/); if(m){ const c=parseFloat(m[1]); val+=(2*x)/(x*x+c); continue; } } return val; }

function solveRelatedRates(row){ const t=(row.questionText||'')+' '+(row.questionLatex||''); if(/x\^3\s*\+\s*y\s*=\s*1/.test(t)||(/x\^3/.test(t)&&/y\s*=\s*1/.test(t))){ const x0=-1, dydt=3; const dxdt= -dydt/(3*x0*x0); return {answer:`dx/dt = ${dxdt} at t=0`, answerLatex:`\\dfrac{dx}{dt} = ${dxdt}`}; } if(/xy\s*=\s*y\^4\s*-\s*x/.test(t)){ const x=0.5,y=1,dxdt=7; const dydt= -(dxdt*(1+y))/(x-4*Math.pow(y,3)); return {answer:`dy/dt = ${dydt}`, answerLatex:`\\dfrac{dy}{dt} = ${dydt}`}; } if(/2p\s*\+\s*3x\^2\s*=\s*247/.test(t)){ const x=7, dpdt=6; const dxdt= -(dpdt)/(3*x); return {answer:`dx/dt = ${round(dxdt,6)} (thousand units per month)`, answerLatex:`\\dfrac{dx}{dt} = ${round(dxdt,6)}`}; } if(/576\s*p\^2\s*[−-]\s*x\^2\s*=\s*92/.test(t)){ const x=22, dxdt=-0.8, p=1; const dpdt=(x*dxdt)/(576*p); return {answer:`dp/dt = ${round(dpdt,6)} dollars per week`, answerLatex:`\\dfrac{dp}{dt} = ${round(dpdt,6)}`}; } if(/p\s*=\s*-0\.02x\^2\s*-\s*0\.1x\s*\+\s*10/.test(t)){ const x=10, p=-0.02*x*x-0.1*x+10; const dpdx=-0.04*x-0.1; const E=round(-(x/p)*dpdx,6); return {answer:`E(10) = ${E} (inelastic)`, answerLatex:`E(10) = ${E}`}; } return null; }

function solveRow(row){ if (hasAnswer(row)) return row; let ans=null; const cluster=row.cluster||'', topic=row.topic||''; if(/Concepts of Economics/.test(cluster)){ if(/Marginal/.test(topic)) ans=solveEconomicsMarginal(row); else if(/Related Rates/i.test(topic)) ans=solveRelatedRates(row); else if(/Elasticity/i.test(topic)) ans=solveElasticity(row); }
  if(!ans && /Maximum and Minimum Values/.test(cluster) && /Relative Maxima and Minima/.test(topic)) { ans = solveAbsoluteExtrema(row) || solveRelativeExtrema(row); }
  if(!ans && /Applications of the Second Derivative/.test(cluster) && /Concavity/.test(topic)) { ans = solveConcavity(row); }
  if(!ans && /Applications of the Second Derivative/.test(cluster) && /Second Derivative Test/.test(topic)) { ans = solveRelativeExtrema(row); if(ans){ ans.answer += ' (by Second Derivative Test)'; ans.answerLatex += ' (SDT)'; } }
  if(ans){
    // Always refresh LaTeX for second-derivative related topics to ensure proper escaping
    if(/Applications of the Second Derivative/.test(cluster)){
      if(ans.answer) row.answer = row.answer || ans.answer;
      if(ans.answerLatex) row.answerLatex = ans.answerLatex;
    } else {
      row.answer = row.answer || ans.answer;
      row.answerLatex = row.answerLatex || ans.answerLatex;
    }
  }
  return row; }

function main(){
  const input=path.join(__dirname,'../src/data/all-questions.cleaned.csv');
  const out=path.join(__dirname,'../src/data/all-questions.answered.csv');
  const {headers, rows}=readCSV(input);
  if(headers.length===0){ console.error('No headers'); process.exit(1); }
  for(const col of ['answer','answerLatex','solutionText','solutionLatex']) if(!headers.includes(col)) headers.push(col);
  const outRows=rows.map(r=>solveRow({...r})).map(r=>{
    if((!r.answer || !r.answer.trim()) && r.answerLatex) r.answer = latexToPlain(r.answerLatex);
    if((!r.solutionText || !r.solutionText.trim()) && r.solutionLatex) r.solutionText = latexToPlain(r.solutionLatex);
    return r;
  });
  writeCSV(out, headers, outRows);
  console.log('Wrote', out);
}

if(require.main===module) main();
