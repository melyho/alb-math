const fs = require('fs');
const path = require('path');

function readCSV(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const values = parseCSVLine(line);
    function answerElasticity(row) {
      const t = (row.questionText || '') + ' ' + (row.questionLatex || '');
      const mP0 = t.match(/p0\s*=\s*(\d+(?:\.\d+)?)/i);
      const p0 = mP0 ? parseFloat(mP0[1]) : null;
      let expr = null;
      const mEq = t.match(/x\s*=\s*([^;\n]+)/);
      if (mEq) expr = mEq[1].trim();
      if (!expr) {
        const mLin = t.match(/x\s*\+\s*\(\s*([+-]?\d+(?:\/\d+)?(?:\.\d+)?)\s*\)\s*p\s*([+-]\s*\d+(?:\.\d+)?)\s*=\s*0/)
                  || t.match(/x\s*\+\s*([+-]?\d+(?:\/\d+)?(?:\.\d+)?)\s*p\s*([+-]\s*\d+(?:\.\d+)?)\s*=\s*0/);
        if (mLin) {
          const a = parseSimpleNumber(mLin[1]);
          const b = parseFloat(mLin[2].replace(/\s+/g,''));
          expr = `${-a}*p ${b>=0?'+':'-'} ${Math.abs(b)}`;
        }
      }
      if (!expr || p0 == null) return null;
      const xOfP = (p) => evalExprForVar(expr, 'p', p);
      const dxdp = (p) => {
        const h = Math.max(1e-5, Math.abs(p) * 1e-5);
        const xp1 = xOfP(p + h);
        const xm1 = xOfP(p - h);
        if (xp1 == null || xm1 == null) return null;
        return (xp1 - xm1) / (2*h);
      };
      let x0 = xOfP(p0);
      let dxdp0 = dxdp(p0);
      let E = (x0 && dxdp0 != null) ? (-p0 / x0) * dxdp0 : null;
      if (E == null) {
        const mS = expr.match(/sqrt\(([^)]+)\)/) || expr.match(/\\sqrt\{([^}]+)\}/);
        if (mS) {
          const inner = mS[1].replace(/\s+/g,'');
          const js = inner.replace(/p\^2/g,'(p**2)').replace(/\^/g,'**');
          try {
            const f = new Function('p', `return (${js});`);
            x0 = Math.sqrt(f(p0));
            const h = 1e-5; const g1 = f(p0+h), g2 = f(p0-h);
            dxdp0 = (g1 - g2) / (2*h) / (2 * x0);
            E = (-p0 / x0) * dxdp0;
          } catch { /* ignore */ }
        }
      }
      if (E == null) return null;
      const Eval = round(E, 6);
      const aE = Math.abs(Eval);
      const cls = aE > 1 ? 'elastic' : (aE < 1 ? 'inelastic' : 'unitary');
      const rev = aE > 1 ? 'Revenue decreases when price increases.' : (aE < 1 ? 'Revenue increases when price increases.' : 'Revenue unchanged for small price changes.');
      return { answer: `E(p0) = ${Eval}; classification: ${cls}. ${rev}`, answerLatex: `E(${p0}) = ${Eval}` };
    }
  if (/sqrt\(|\\sqrt\{/.test(term) || /e\^|\\exp|\\ln|ln\(/.test(term) || /\//.test(term)) return null;
  // Match coefficient and power
  const mPow = term.match(/^([+-]?\d*\.?\d*)x\^\{?([+-]?\d*\/?\d+)\}?$/);
  if (mPow) {
    const a = mPow[1] === '' || mPow[1] === '+' ? 1 : (mPow[1] === '-' ? -1 : parseFloat(mPow[1]));
    const nStr = mPow[2];
    const n = nStr.includes('/') ? (parseFloat(nStr.split('/')[0]) / parseFloat(nStr.split('/')[1])) : parseFloat(nStr);
    const newCoeff = a * n;
    const newPow = n - 1;
    return `${stripCoeff(newCoeff)}x^${formatPow(newPow)}`;
  }
  const mX = term.match(/^([+-]?\d*\.?\d*)x$/);
  if (mX) {
    const a = mX[1] === '' || mX[1] === '+' ? 1 : (mX[1] === '-' ? -1 : parseFloat(mX[1]));
    return `${stripCoeff(a)}`;
  }
  const mConst = term.match(/^([+-]?\d*\.?\d+)$/);
  if (mConst) {
    return '0';
  }
  return null;
}

function formatPow(p) {
  if (Number.isInteger(p)) return `{${p}}`;
  const s = p.toString();
  return `{${s}}`;
}
function stripCoeff(c) {
  const r = round(c, 6);
  return (r === 1 ? '' : (r === -1 ? '-' : r.toString()));
}

function deriveC(expr) {
  // Very limited: sum of terms separated by +/-, supports x^n, ax^n, ax, constant, sqrt(ax+b), e^{ax+b}, ln(x^2+...), powers with fractional exponents as x^{p}
  // Split into additive terms at top-level only
  const terms = splitTopLevel(expr);
  const dTerms = [];
  for (let t of terms) {
    let d = derivativePolyTerm(t);
    if (d === null) {
      // sqrt(ax+b)
      let m = t.match(/^sqrt\(([-+]?\d*\.?\d*)x([+-]\d*\.?\d+)\)$/) || t.match(/^\\sqrt\{([-+]?\d*\.?\d*)x([+-]\d*\.?\d+)\}$/);
      if (m) {
        const a = parseFloat(m[1] || '1');
        const b = parseFloat(m[2] || '0');
        d = `${round(a/2)} / \\sqrt{${a}x${b>=0?`+${b}`:b}}`;
      }
      // e^{ax+b}
      if (!d) {
        m = t.match(/^e\^\{([-+]?\d*\.?\d*)x([+-]\d*\.?\d+)\}$/);
        if (m) {
          const a = parseFloat(m[1] || '1');
          const b = m[2];
          d = `${a} e^{${a}x${b}}`;
        }
      }
      // ln(x^2+...)
      if (!d) {
        m = t.match(/^\\?ln\(x\^2([+-]\d+)\)$/) || t.match(/^\\ln\\left\(x\^2([+-]\d+)\\right\)$/);
        if (m) {
          const c = parseFloat(m[1]);
          d = `\\frac{2x}{x^2${c>=0?`+${c}`:c}}`;
        }
      }
      // x^{p}
      if (!d) {
        m = t.match(/^([+-]?\d*\.?\d*)x\^\{([^}]+)\}$/);
        if (m) {
          const a = m[1] === '' || m[1] === '+' ? 1 : (m[1] === '-' ? -1 : parseFloat(m[1]));
          const pStr = m[2];
          const p = pStr.includes('/') ? (parseFloat(pStr.split('/')[0]) / parseFloat(pStr.split('/')[1])) : parseFloat(pStr);
          const newCoeff = a * p;
          const newPow = p - 1;
          d = `${stripCoeff(newCoeff)}x^${formatPow(newPow)}`;
        }
      }
    }
    if (d) dTerms.push(d);
  }
  return dTerms.join(' + ').replace(/\+ -/g, '- ');
}

function evalCprimeAt(expr, x) {
  // Evaluate derivative numerically using simple parsing of known forms
  // We will compute derivative directly without building symbolic string
  const terms = splitTopLevel(expr);
  let val = 0;
  for (const t of terms) {
    // ax^n
    let m = t.match(/^([+-]?\d*\.?\d*)x\^\{?([+-]?\d*\/?\d+)\}?$/);
    if (m) {
      const a = m[1] === '' || m[1] === '+' ? 1 : (m[1] === '-' ? -1 : parseFloat(m[1]));
      const nStr = m[2];
      const n = nStr.includes('/') ? (parseFloat(nStr.split('/')[0]) / parseFloat(nStr.split('/')[1])) : parseFloat(nStr);
      val += a * n * Math.pow(x, n - 1);
      continue;
    }
    // ax
    m = t.match(/^([+-]?\d*\.?\d*)x$/);
    if (m) {
      const a = m[1] === '' || m[1] === '+' ? 1 : (m[1] === '-' ? -1 : parseFloat(m[1]));
      val += a;
      continue;
    }
    // constant
    m = t.match(/^([+-]?\d*\.?\d+)$/);
    if (m) { /* derivative 0 */ continue; }
    // sqrt(ax+b)
    m = t.match(/^sqrt\(([-+]?\d*\.?\d*)x([+-]\d*\.?\d+)\)$/) || t.match(/^\\sqrt\{([-+]?\d*\.?\d*)x([+-]\d*\.?\d+)\}$/);
    if (m) {
      const a = parseFloat(m[1] || '1');
      const b = parseFloat(m[2] || '0');
      val += a / (2 * Math.sqrt(a * x + b));
      continue;
    }
    // e^{ax+b}
    m = t.match(/^e\^\{([-+]?\d*\.?\d*)x([+-]\d*\.?\d+)\}$/);
    if (m) {
      const a = parseFloat(m[1] || '1');
      const b = parseFloat(m[2] || '0');
      val += a * Math.exp(a * x + b);
      continue;
    }
    // ln(x^2+c)
    m = t.match(/^\\?ln\(x\^2([+-]\d+)\)$/) || t.match(/^\\ln\\left\(x\^2([+-]\d+)\\right\)$/);
    if (m) {
      const c = parseFloat(m[1]);
      val += (2 * x) / (x * x + c);
      continue;
    }
  }
  return val;
}

function splitTopLevel(expr) {
  const s = expr.replace(/−/g,'-');
  const out = [];
  let current = '';
  let depthParen = 0;
  let depthBrace = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depthParen++;
    if (ch === ')') depthParen = Math.max(0, depthParen - 1);
    if (ch === '{') depthBrace++;
    if (ch === '}') depthBrace = Math.max(0, depthBrace - 1);
    if ((ch === '+' || ch === '-') && depthParen === 0 && depthBrace === 0) {
      if (current.trim()) out.push(current.trim());
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  // normalize whitespace
  return out.map(t => t.replace(/\s+/g,'').replace(/^\+\+/g,'+').replace(/--/g,'+'));
}

function answerEconomicsMarginal(row) {
  const qText = row.questionText || '';
  const qLatex = row.questionLatex || '';
  const expr = parseCfromLatex(qLatex);
  if (!expr) return null;
  const xs = extractNumbersFromText(qText);
  // Choose up to two evaluation points (first two numbers that look like x values)
  const evalPoints = xs.filter(n => Math.abs(n) < 1e6).slice(0, 3); // be safe
  const vals = evalPoints.map(x => ({ x, v: round(evalCprimeAt(expr, x), 6) }));
  // Trend assessment based on first two values if available
  let trend = '';
  if (vals.length >= 2) {
    trend = vals[1].v < vals[0].v ? 'Marginal cost decreases as production increases.' : (vals[1].v > vals[0].v ? 'Marginal cost increases as production increases.' : 'Marginal cost is constant.');
  }
  const parts = vals.map(({x,v}) => `C'( ${x} ) = ${v}`);
  return {
    answer: parts.join('; ') + (trend ? `. ${trend}` : ''),
    answerLatex: parts.join(', ')
  };
}

function answerEconomicsRevenue(row) {
  const qLatex = row.questionLatex || '';
  // Expect p = ax + b ; extract a,b
  const m = qLatex.match(/p\s*=\s*([+-]?\d*\.?\d*)x\s*([+-]\s*\d+(?:\.\d+)*)/);
  if (!m) return null;
  const a = parseFloat(m[1] || '1');
  const b = parseFloat(m[2].replace(/\s+/g,'') || '0');
  // R = px = (ax + b)x = a x^2 + b x
  // R'(x) = 2 a x + b
  const Rprime = (x) => 2*a*x + b;
  // Find x from question text
  const xs = (row.questionText.match(/R'\(\s*([\d,\s]+)\s*\)/) || [])[1];
  let rvLine = '';
  if (xs) {
    const x0 = parseFloat(xs.replace(/,/g,''));
    rvLine = `, R'(${x0}) = ${round(Rprime(x0), 6)}`;
  }
  return {
    answer: `R(x) = ${a === 0 ? '' : a}x^2 + ${b}x; R'(x) = ${2*a}x + ${b}${rvLine}. If R'(x0) > 0 revenue increases, if < 0 decreases, if 0 stationary.`,
    answerLatex: `R(x) = ${a}x^{2} + ${b}x,\ R'(x) = ${2*a}x + ${b}${rvLine}`
  };
}

function answerElasticity(row) {
  const t = (row.questionText || '') + ' ' + (row.questionLatex || '');
  // Extract p0
  const mP0 = t.match(/p0\s*=\s*(\d+(?:\.\d+)?)/i);
  const p0 = mP0 ? parseFloat(mP0[1]) : null;
  // Try to get x = f(p)
  let m = t.match(/x\s*=\s*([^;\n]+)/);
  let expr = m ? m[1].trim() : null;
  // Or linear form: x + ap + b = 0
  if (!expr) {
    const m2 = t.match(/x\s*\+\s*\(?([+-]?\d*\.?\d+)\)?p\s*([+-]\s*\d*\.?\d+)\s*=\s*0/);
    if (m2) {
      const a = parseFloat(m2[1]);
      const b = parseFloat(m2[2].replace(/\s+/g,''));
      // x = -ap - b
      expr = `${-a}*p ${b>=0?'+':'-'} ${Math.abs(b)}`;
    }
  }
  if (!expr) return null;
  // Evaluate numerically using JS transform to support fractions and sqrt
  const xOfP = (p) => evalExprForVar(expr, 'p', p);
  const dxdp = (p) => {
    const h = Math.max(1e-5, Math.abs(p) * 1e-5);
    const xp1 = xOfP(p + h);
    const xm1 = xOfP(p - h);
    if (xp1 == null || xm1 == null) return null;
    return (xp1 - xm1) / (2 * h);
  };
  if (p0 == null) return null;
  let x0 = xOfP(p0);
  let dxdp0 = dxdp(p0);
  const Eraw = x0 && dxdp0 != null ? (-p0 / x0) * dxdp0 : null;
  const E = Eraw == null ? null : round(Eraw, 6);
  let cls = '';
  if (E == null) {
  if (E != null) {
    const aE = Math.abs(E);
    if (aE > 1) { cls = 'elastic'; rev = 'Revenue decreases when price increases.'; }
    else if (aE < 1) { cls = 'inelastic'; rev = 'Revenue increases when price increases.'; }
    else { cls = 'unitary'; rev = 'Revenue unchanged for small price changes.'; }
      const b = mLin[2] ? parseFloat(mLin[2].replace(/\s+/g,'')) : 0;
      x0 = a * p0 + b;
      dxdp0 = a;
      E = round((-p0 / x0) * dxdp0, 6);
    }
  }
  if (E == null) {
    // sqrt(inner) where inner is polynomial up to p^2
    const mS = expr.match(/sqrt\(([^)]+)\)/) || expr.match(/\\sqrt\{([^}]+)\}/);
    if (mS) {
      const inner = mS[1].replace(/\s+/g,'');
      const js = inner.replace(/p\^2/g,'(p**2)').replace(/\^/g,'**');
      try {
        const f = new Function('p', `return (${js});`);
        x0 = Math.sqrt(f(p0));
        // central diff of inner then chain rule
        const h = 1e-5;
        const g1 = f(p0 + h), g2 = f(p0 - h);
        const gprime = (g1 - g2) / (2*h);
        dxdp0 = gprime / (2 * x0);
        E = round((-p0 / x0) * dxdp0, 6);
      } catch (_) { /* ignore */ }
    }
  }
  let cls = '';
  let rev = '';
  if (E != null) {
    if (E > 1) { cls = 'elastic'; rev = 'Revenue decreases when price increases.'; }
    else if (E < 1) { cls = 'inelastic'; rev = 'Revenue increases when price increases.'; }
    else { cls = 'unitary'; rev = 'Revenue unchanged for small price changes.'; }
  }
  return {
    answer: `E(p0) = ${E}; classification: ${cls}. ${rev}`,
    answerLatex: `E(${p0}) = ${E}`
  };
}

function answerElasticityArt(row) {
  const t = (row.questionText || '') + ' ' + (row.questionLatex || '');
  // Expect x = sqrt(7500 - 0.03 p^2)
  const m = t.match(/x\s*=\s*\\?sqrt\(?(7500\s*[-+]\s*0\.03\s*p\^2)\)?/i) || t.match(/x\s*=\s*\\sqrt\{(7500\s*[-+]\s*0\.03\s*p\^2)\}/i);
  if (!m) return null;
  // E = 0.03 p^2 / (7500 - 0.03 p^2)
  const unitP = Math.sqrt(7500/0.06); // sqrt(125000)
  const pStar = round(unitP, 6);
  return {
    answer: `E(p) = 0.03 p^2 / (7500 - 0.03 p^2). Inelastic for p < ${pStar}, elastic for p > ${pStar}, unitary at p = ${pStar}. Price to maximize revenue: ${pStar}.`,
    answerLatex: `E(p) = \dfrac{0.03\,p^{2}}{7500 - 0.03\,p^{2}},\ \ p_{\mathrm{unit}} = ${pStar}`
  };
}

// ---------- RELATED RATES ----------
function answerRelatedRates(row) {
  const t = (row.questionText || '') + ' ' + (row.questionLatex || '');
  // Case 1: x^3 + y = 1, at t=0, x(0) = -1, dy/dt = 3
  if (/x\^3\s*\+\s*y\s*=\s*1/.test(t) || /x\^3\+\sy\s*=\s*1/.test(t)) {
    const x0 = -1; const dydt = 3;
    const dxdt = -dydt / (3 * x0 * x0);
    return { answer: `dx/dt = ${dxdt} at t=0`, answerLatex: `\\dfrac{dx}{dt} = ${dxdt}` };
  }
  // or split relation variant: contains x^3 and y = 1
  if (/x\^3/.test(t) && /y\s*=\s*1/.test(t)) {
    const x0 = -1; const dydt = 3;
    const dxdt = -dydt / (3 * x0 * x0);
    return { answer: `dx/dt = ${dxdt} at t=0`, answerLatex: `\\dfrac{dx}{dt} = ${dxdt}` };
  }
  // Case 2: xy = y^4 - x, at t=1, x=0.5, y=1, dx/dt=7
  if (/xy\s*=\s*y\^4\s*-\s*x/.test(t)) {
    const x = 0.5, y = 1, dxdt = 7;
    const dydt = -(dxdt * (1 + y)) / (x - 4 * Math.pow(y,3));
    return { answer: `dy/dt = ${dydt}`, answerLatex: `\\dfrac{dy}{dt} = ${dydt}` };
  }
  // Case 3: 2p + 3x^2 = 247, given x=7 and dp/dt=6
  if (/2p\s*\+\s*3x\^2\s*=\s*247/.test(t)) {
    const x = 7, dpdt = 6;
    const dxdt = -(dpdt) / (3 * x);
    return { answer: `dx/dt = ${round(dxdt, 6)} (thousand units per month)`, answerLatex: `\\dfrac{dx}{dt} = ${round(dxdt, 6)}` };
  }
  // Case 4: 576 p^2 − x^2 = 92, x=22 (thousand), dx/dt = -0.8 (thousand per week)
  if (/576\s*p\^2\s*[−-]\s*x\^2\s*=\s*92/.test(t)) {
    const x = 22, dxdt = -0.8;
    const p = 1; // from equation at x=22
    const dpdt = (x * dxdt) / (576 * p);
    return { answer: `dp/dt = ${round(dpdt, 6)} dollars per week`, answerLatex: `\\dfrac{dp}{dt} = ${round(dpdt, 6)}` };
  }
  // Case 5: p = -0.02 x^2 − 0.1 x + 10, elasticity at x = 10
  if (/p\s*=\s*-0\.02x\^2\s*-\s*0\.1x\s*\+\s*10/.test(t)) {
    const x = 10; const p = -0.02*x*x - 0.1*x + 10;
    const dpdx = -0.04*x - 0.1;
    const E = round(-(x/p)*dpdx, 6);
    return { answer: `E(10) = ${E} (inelastic)`, answerLatex: `E(10) = ${E}` };
  }
  return null;
}

function evalExprForVar(expr, varName, varValue) {
  try {
    let s = expr;
    s = s.replace(/\s+/g,'');
    s = s.replace(/\\left|\\right/g,'');
    // Replace LaTeX sqrt and std sqrt
    s = s.replace(/\\sqrt\{([^}]+)\}/g, 'Math.sqrt($1)');
    s = s.replace(/sqrt\(([^)]+)\)/g, 'Math.sqrt($1)');
    // Convert ^ to **
    s = s.replace(/\^/g, '**');
    // Replace implied multiplication like number var: 0.03p -> 0.03*p
    s = s.replace(/(\d)\s*([a-zA-Z])/g, '$1*$2');
    // )p -> )*p
    s = s.replace(/\)\s*([a-zA-Z])/g, ')*$1');
    // number( -> number*(
    s = s.replace(/(\d)\s*\(/g, '$1*(');
    // Curly to parens
    s = s.replace(/[{}]/g, (m) => (m === '{' ? '(' : ')'));
    // Replace variable name
    const fn = new Function(varName, `return (${s});`);
    const val = fn(varValue);
    if (typeof val !== 'number' || Number.isNaN(val)) return null;
    return val;
  } catch (e) {
    return null;
  }
}

// ---------- CALCULUS: Relative Extrema ----------
function parseFx(row) {
  const t = (row.questionLatex || row.questionText || '').replace(/\s+/g,'');
  let m = t.match(/f\((x|t)\)=([^,]+)/);
  if (!m) return null;
  const varName = m[1];
  let expr = m[2];
  expr = expr.replace(/\^/g,'**').replace(/\\ln/g,'ln').replace(/\\/g,'');
  expr = expr.replace(/\{([^}]+)\}/g,'($1)');
  return { varName, expr };
}

function evalExpr(expr, vname, v) {
  try {
    let s = expr;
    s = s.replace(/(\d)([a-zA-Z(])/g, '$1*$2');
    s = s.replace(/([)a-zA-Z])(\()/g, '$1*$2');
    s = s.replace(/ln\(/g, 'Math.log(');
    s = s.replace(/e\*\*\(/g, 'Math.exp(');
    s = s.replace(/e\*\*([^a-zA-Z(])/g, (_,g1)=>`Math.exp(${g1}`); // crude
    s = s.replace(/Math\.exp\(([^)]+)\)\*\*([0-9.]+)/g, 'Math.pow(Math.exp($1),$2)');
    s = s.replace(/(\d+)\*\*\(([^)]+)\)/g,'Math.pow($1,$2)');
    const fn = new Function(vname, `return (${s});`);
    const val = fn(v);
    if (typeof val !== 'number' || Number.isNaN(val)) return null;
    return val;
  } catch { return null; }
}

function derivativeNum(expr, vname, v, h = 1e-5) {
  const f1 = evalExpr(expr, vname, v + h);
  const f2 = evalExpr(expr, vname, v - h);
  if (f1 == null || f2 == null) return null;
  return (f1 - f2) / (2*h);
}

function secondDerivativeNum(expr, vname, v, h = 1e-4) {
  const f1 = evalExpr(expr, vname, v + h);
  const f0 = evalExpr(expr, vname, v);
  const f2 = evalExpr(expr, vname, v - h);
  if (f1 == null || f0 == null || f2 == null) return null;
  return (f1 - 2*f0 + f2) / (h*h);
}

function answerRelativeExtrema(row) {
  const parsed = parseFx(row);
  if (!parsed) return null;
  const { varName, expr } = parsed;
  // Try special cases: quadratic ax^2+bx+c
  const quad = expr.match(/^([+-]?\d*\.?\d*)\*?x\*\*2([+-]\d*\.?\d*)\*?x([+-]\d*\.?\d+)?$/);
  if (quad) {
    const a = quad[1] === '' || quad[1] === '+' ? 1 : (quad[1] === '-' ? -1 : parseFloat(quad[1]));
    const b = parseFloat(quad[2].replace(/\s+/g,''));
    const c = quad[3] ? parseFloat(quad[3]) : 0;
    const xv = -b / (2*a);
    const fv = evalExpr(expr, varName, xv);
    const kind = a > 0 ? 'relative minimum' : 'relative maximum';
    return { answer: `${kind} at x = ${round(xv,6)}, f(${round(xv,6)}) = ${round(fv,6)}`, answerLatex: `${kind} \text{ at } x=${round(xv,6)},\ f(${round(xv,6)})=${round(fv,6)}` };
  }
  // Cubic ax^3+bx^2+cx+d
  const cubic = expr.match(/^([+-]?\d*\.?\d*)\*?x\*\*3([+-]\d*\.?\d*)\*?x\*\*2([+-]\d*\.?\d*)\*?x([+-]\d*\.?\d+)?$/);
  if (cubic) {
    const a = cubic[1] === '' || cubic[1] === '+' ? 1 : (cubic[1] === '-' ? -1 : parseFloat(cubic[1]));
    const b = parseFloat(cubic[2]);
    const c = parseFloat(cubic[3]);
    const d = cubic[4] ? parseFloat(cubic[4]) : 0;
    // f'(x)=3ax^2+2bx+c -> quadratic
    const A = 3*a, B = 2*b, C = c;
    const disc = B*B - 4*A*C;
    if (disc < 0) return { answer: 'No relative extrema', answerLatex: ' \text{No relative extrema}' };
    const r1 = (-B - Math.sqrt(disc)) / (2*A);
    const r2 = (-B + Math.sqrt(disc)) / (2*A);
    const s1 = secondDerivativeNum(expr, varName, r1);
    const s2 = secondDerivativeNum(expr, varName, r2);
    const out = [];
    const push = (x0,s) => {
      const kind = s > 0 ? 'relative minimum' : (s < 0 ? 'relative maximum' : 'saddle point');
      const f0 = evalExpr(expr, varName, x0);
      out.push(`${kind} at ${varName}=${round(x0,6)} with f=${round(f0,6)}`);
    };
    push(r1, s1); push(r2, s2);
    return { answer: out.join('; '), answerLatex: out.join('; ') };
  }
  // Other forms: use numeric search around a grid
  const grid = [];
  for (let x = -5; x <= 5; x += 0.5) grid.push(x);
  const crits = new Set();
  for (let i = 1; i < grid.length; i++) {
    const a = grid[i-1], b = grid[i];
    const fa = derivativeNum(expr, varName, a);
    const fb = derivativeNum(expr, varName, b);
    if (fa == null || fb == null) continue;
    if (fa === 0) crits.add(round(a,6));
    if (fa*fb < 0) {
      // bisection
      let L=a,R=b;
      for (let k=0;k<30;k++){
        const M=(L+R)/2; const fL=derivativeNum(expr,varName,L), fM=derivativeNum(expr,varName,M);
        if (fL==null||fM==null) break;
        if (fL*fM<=0) R=M; else L=M;
      }
      crits.add(round((L+R)/2,6));
    }
  }
  if (crits.size===0) return null;
  const out = [];
  for (const x0 of Array.from(crits).sort((a,b)=>a-b)) {
    const s = secondDerivativeNum(expr, varName, x0);
    const kind = s>0?'relative minimum':(s<0?'relative maximum':'saddle point');
    const f0 = evalExpr(expr, varName, x0);
    out.push(`${kind} at ${varName}=${round(x0,6)} with f=${round(f0,6)}`);
  }
  return { answer: out.join('; '), answerLatex: out.join('; ') };
}

function answerAbsoluteExtrema(row) {
  const t = (row.questionText || '') + ' ' + (row.questionLatex || '');
  const parsed = parseFx(row);
  if (!parsed) return null;
  const { varName, expr } = parsed;
  const m = t.match(/\[\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*\]/);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[2]);
  const candidates = [a,b];
  // try to add stationary points inside [a,b]
  for (let x = a; x <= b; x += (b-a)/20) {
    const fa = derivativeNum(expr, varName, x);
    const fb = derivativeNum(expr, varName, x + (b-a)/20);
    if (fb==null||fa==null) continue;
    if (fa*fb < 0) {
      let L=x, R=x+(b-a)/20;
      for (let k=0;k<30;k++){
        const M=(L+R)/2; const fL=derivativeNum(expr,varName,L), fM=derivativeNum(expr,varName,M);
        if (fL==null||fM==null) break;
        if (fL*fM<=0) R=M; else L=M;
      }
      const r = (L+R)/2; if (r>a && r<b) candidates.push(r);
    }
  }
  const vals = candidates.map(x0 => ({ x:x0, y: evalExpr(expr, varName, x0) }));
  const max = vals.reduce((p,c)=> (p==null||c.y>p.y?c:p), null);
  const min = vals.reduce((p,c)=> (p==null||c.y<p.y?c:p), null);
  return { answer: `Absolute min at ${varName}=${round(min.x,6)} with f=${round(min.y,6)}; absolute max at ${varName}=${round(max.x,6)} with f=${round(max.y,6)}`,
           answerLatex: `\text{min at } ${varName}=${round(min.x,6)},\ f=${round(min.y,6)};\ \text{max at } ${varName}=${round(max.x,6)},\ f=${round(max.y,6)}` };
}

function answerConcavity(row) {
  const parsed = parseFx(row);
  if (!parsed) return null;
  const { varName, expr } = parsed;
  // Probe intervals around a grid
  const points = [-5,-2,-1,-0.5,0,0.5,1,2,5];
  const sVals = points.map(x => ({x, s: secondDerivativeNum(expr, varName, x)}));
  const intervals = [];
  let prev = null;
  for (let i=0;i<sVals.length;i++){
    const cur = sVals[i];
    if (prev){
      const a = prev.x, b = cur.x;
      const sa = prev.s, sb = cur.s;
      if (sa!=null && sb!=null){
        const sign = sa>0 && sb>0 ? 'up' : (sa<0 && sb<0 ? 'down' : 'mixed');
        if (sign!=='mixed') intervals.push({a,b,sign});
      }
    }
    prev = cur;
  }
  // inflection: where second derivative crosses zero (approx)
  const infl = [];
  for (let i=1;i<sVals.length;i++){
    const a=sVals[i-1], b=sVals[i];
    if (a.s!=null && b.s!=null && a.s*b.s<0){
      let L=a.x,R=b.x;
      for(let k=0;k<30;k++){
        const M=(L+R)/2; const sM=secondDerivativeNum(expr,varName,M);
        if (a.s*sM<=0) R=M; else L=M;
      }
      infl.push(round((L+R)/2,6));
    }
  }
  const upSegs = intervals.filter(z=>z.sign==='up').map(z=>`(${z.a}, ${z.b})`);
  const dnSegs = intervals.filter(z=>z.sign==='down').map(z=>`(${z.a}, ${z.b})`);
  return { answer: `Concave up on ${upSegs.join(' ∪ ') || 'none'}; concave down on ${dnSegs.join(' ∪ ') || 'none'}; inflection points at ${infl.join(', ') || 'none'}`,
           answerLatex: `\text{Up on } ${upSegs.join(' \\cup ')};\ \text{Down on } ${dnSegs.join(' \\cup ')};\ \text{Inflection at } ${infl.join(', ')}` };
}

function answerSecondDerivativeTest(row) {
  // Reuse relative extrema and include explicit SDT mention
  const ex = answerRelativeExtrema(row);
  if (!ex) return null;
  ex.answer = ex.answer + ' (by Second Derivative Test)';
  ex.answerLatex = ex.answerLatex + ' (\text{SDT})';
  return ex;
}

function parseSimpleNumber(s) {
  try {
    const cleaned = s.replace(/[()]/g,'');
    if (cleaned.includes('/')) {
      const [n,d] = cleaned.split('/').map(parseFloat);
      return n / d;
    }
    return parseFloat(cleaned);
  } catch {
    return NaN;
  }
}

function processRow(row) {
  if (hasAnswer(row)) return row;
  const cluster = row.cluster || '';
  const topic = row.topic || '';
  let computed = null;
  if (cluster.includes('Concepts of Economics') && topic.includes('Marginal')) {
    computed = answerEconomicsMarginal(row);
  } else if (cluster.includes('Concepts of Economics') && /demand/i.test(topic)) {
    // Elasticity
    const art = answerElasticityArt(row);
    computed = art || answerElasticity(row);
  } else if (cluster.includes('Concepts of Economics') && /Related Rates/i.test(topic)) {
    computed = answerRelatedRates(row);
  } else if (cluster.includes('Concepts of Economics')) {
    // Revenue
    computed = answerEconomicsRevenue(row);
  } else if (/Maximum and Minimum Values/.test(cluster) && /Relative Maxima and Minima/.test(topic)) {
    // Relative extrema and also absolute on intervals (detected via 'on [a,b]')
    if (/(\[\s*[+-]?\d)/.test((row.questionText||'')+(row.questionLatex||''))) {
      computed = answerAbsoluteExtrema(row);
    }
    computed = computed || answerRelativeExtrema(row);
  } else if (/Applications of the Second Derivative/.test(cluster) && /Concavity/.test(topic)) {
    computed = answerConcavity(row);
  } else if (/Applications of the Second Derivative/.test(cluster) && /Second Derivative Test/.test(topic)) {
    computed = answerSecondDerivativeTest(row);
  }
  if (computed) {
    row.answer = row.answer || computed.answer;
    row.answerLatex = row.answerLatex || computed.answerLatex;
  }
  return row;
}

function main() {
  const inputPath = path.join(__dirname, '../src/data/all-questions.cleaned.csv');
  const outputPath = path.join(__dirname, '../src/data/all-questions.answered.csv');
  const { headers, rows } = readCSV(inputPath);
  if (headers.length === 0) {
    console.error('No headers found.');
    process.exit(1);
  }
  // Ensure columns exist
  for (const col of ['answer','answerLatex']) {
    if (!headers.includes(col)) headers.push(col);
  }
  const outRows = rows.map(r => processRow({ ...r }));
  writeCSV(outputPath, headers, outRows);
  console.log('Wrote', outputPath);
}

if (require.main === module) main();
