// Contexto de mercado · cálculo puro. Velas: { t, o, h, l, c, v } con t en ms (apertura).
(function (root) {
  'use strict';
  const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
  const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
  const smaAt = (c, n, i) => { if (i + 1 < n) return NaN; let s = 0; for (let k = i - n + 1; k <= i; k++) s += c[k]; return s / n; };
  const pctRank = (arr, v) => arr.filter((x) => x <= v).length / arr.length;

  // 1 · Régimen: precio contra SMA 50 y 200 diarias, y qué pasó históricamente 5 días después en ese mismo estado.
  function regime(daily, fwd = 5) {
    const c = daily.map((d) => d.c), n = c.length, i = n - 1;
    const stateAt = (k) => { const a = smaAt(c, 50, k), b = smaAt(c, 200, k); if (isNaN(b)) return null; return c[k] > a && c[k] > b ? 'long' : c[k] < a && c[k] < b ? 'short' : 'neutral'; };
    const state = stateAt(i), rets = [], all = [];
    for (let k = 200; k + fwd < n; k++) {
      const r = c[k + fwd] / c[k] - 1; all.push(r);
      if (stateAt(k) === state) rets.push(r);
    }
    return { state, price: c[i], sma50: smaAt(c, 50, i), sma200: smaAt(c, 200, i), avgFwd: mean(rets), base: mean(all), pctUp: rets.filter((r) => r > 0).length / (rets.length || 1), n: rets.length, fwd };
  }

  // 2 · Volatilidad realizada de 7 días frente a su historia de un año.
  function volRegime(daily) {
    const r = []; for (let k = 1; k < daily.length; k++) r.push(Math.log(daily[k].c / daily[k - 1].c));
    const win = (end) => std(r.slice(end - 7, end)) * Math.sqrt(365);
    const now = win(r.length), hist = [];
    for (let e = Math.max(7, r.length - 365); e <= r.length; e++) hist.push(win(e));
    const p = pctRank(hist, now);
    return { vol: now, pct: p, label: p < 0.35 ? 'Calma' : p > 0.75 ? 'Agitada' : 'Normal' };
  }
  const change = (candles, bars) => { const n = candles.length; return n > bars ? candles[n - 1].c / candles[n - 1 - bars].c - 1 : NaN; };

  // 3 · ATR de Wilder.
  function atr(candles, n = 14) {
    // Igual que ta.atr de Pine: TR de la primera vela = máximo − mínimo; RMA sembrada con la media de las primeras n.
    const out = new Array(candles.length).fill(NaN); let a = 0;
    for (let k = 0; k < candles.length; k++) {
      const x = candles[k], p = k ? candles[k - 1].c : null;
      const tr = p == null ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - p), Math.abs(x.l - p));
      if (k < n) { a += tr; if (k === n - 1) { a /= n; out[k] = a; } }
      else { a = (a * (n - 1) + tr) / n; out[k] = a; }
    }
    return out;
  }

  // 4 · Cuándo se mueve: rango medio (%) por hora UTC, multiplicador del día de la semana y del momento actual.
  function activity(hourly, daily, now = Date.now()) {
    const byHour = Array.from({ length: 24 }, () => []);
    const done = hourly.filter((x) => x.t + 36e5 <= now);
    for (const x of done.slice(-24 * 30)) byHour[new Date(x.t).getUTCHours()].push((x.h - x.l) / x.o);
    const avgHour = byHour.map(mean), overall = mean(avgHour);
    const last = done[done.length - 1], lh = last ? new Date(last.t).getUTCHours() : 0;
    const nowMult = last ? ((last.h - last.l) / last.o) / avgHour[lh] : NaN;
    // Mejor ventana de 4 horas seguidas (circular)
    let best = 0, bestS = -1;
    for (let s = 0; s < 24; s++) { let v = 0; for (let k = 0; k < 4; k++) v += avgHour[(s + k) % 24]; if (v > best) { best = v; bestS = s; } }
    const cur = new Date(now).getUTCHours(), inPrime = ((cur - bestS + 24) % 24) < 4;
    const startToday = new Date(now); startToday.setUTCHours(bestS, 0, 0, 0);
    let nextStart = +startToday; if (nextStart <= now && !inPrime) nextStart += 864e5;
    // Día de la semana (rango diario / ATR medio del año)
    const days = daily.slice(-365, -1), byDow = Array.from({ length: 7 }, () => []);
    for (const d of days) byDow[new Date(d.t).getUTCDay()].push((d.h - d.l) / d.o);
    const allR = mean(days.map((d) => (d.h - d.l) / d.o)), dow = new Date(now).getUTCDay();
    const dowMult = mean(byDow[dow]) / allR;
    const verdict = dowMult >= 0.85 && (inPrime || nowMult >= 0.7 || (nextStart - now) < 3 * 36e5) ? 'Operar' : 'Esperar';
    return { avgHour, overall, nowMult, lastHour: lh, primeStart: bestS, inPrime, untilPrime: inPrime ? 0 : nextStart - now, dow, dowMult, verdict };
  }

  // 5 · Amplitud 24 h a partir del contexto de Hyperliquid.
  function breadth(assets) {
    const ch = assets.map((a) => ({ coin: a.coin, ch: a.mark / a.prev - 1, vol: a.vol })).filter((a) => isFinite(a.ch));
    const up = ch.filter((a) => a.ch > 0).length, down = ch.filter((a) => a.ch < 0).length;
    return { list: ch.sort((a, b) => b.ch - a.ch), up, down, pctUp: up / (ch.length || 1), median: median(ch.map((a) => a.ch)) };
  }

  // 6 · Diarios de muchas monedas: amplitud 30 d y alts contra BTC.
  function relative(closes, btc, days = 14) {
    const coins = Object.keys(closes).filter((c) => c !== 'BTC');
    const ret = (a, k, d) => a[k] / a[k - d] - 1, n = btc.length;
    const vsBtc = (a, k) => (1 + ret(a, k, days)) / (1 + ret(btc, k, days)) - 1;
    const at = (k) => coins.map((c) => closes[c]).filter((a) => a && a.length === n && isFinite(a[k]) && isFinite(a[k - days]));
    const lead = (k) => { const s = at(k); return s.length ? s.filter((a) => vsBtc(a, k) > 0).length / s.length : NaN; };
    const k = n - 1, cur = at(k), rel = cur.map((a) => vsBtc(a, k));
    const series = [], breadthSeries = [];
    for (let j = Math.max(days, n - 30); j <= k; j++) {
      series.push(lead(j));
      const s = coins.map((c) => closes[c]).filter((a) => a && a.length === n && isFinite(a[j]) && isFinite(a[j - 1]));
      breadthSeries.push(s.filter((a) => a[j] > a[j - 1]).length / (s.length || 1));
    }
    const eth = closes.ETH && closes.ETH.length === n ? vsBtc(closes.ETH, k) : NaN;
    return { leading: rel.filter((r) => r > 0).length, total: rel.length, medianVsBtc: median(rel), ethVsBtc: eth, series, breadthSeries };
  }

  // 7 · Gap de CME aproximado con el precio de BTC en Hyperliquid (velas de 1 h).
  // CME cierra el viernes 16:00 hora de Chicago y reabre el domingo 17:00.
  function chicagoToUtc(y, m, d, h) {
    const guess = Date.UTC(y, m, d, h);
    const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric' });
    const p = Object.fromEntries(f.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
    const asCt = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24);
    return guess + (guess - asCt);
  }
  function cmeGaps(hourly, now = Date.now(), weeks = 8) {
    const byT = new Map(hourly.map((x, i) => [x.t, i])), out = [];
    const d0 = new Date(now);
    for (let w = 0; w < weeks; w++) {
      const sun = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate() - d0.getUTCDay() - 7 * w));
      const fri = new Date(+sun - 2 * 864e5);
      const closeT = chicagoToUtc(fri.getUTCFullYear(), fri.getUTCMonth(), fri.getUTCDate(), 16);
      const openT = chicagoToUtc(sun.getUTCFullYear(), sun.getUTCMonth(), sun.getUTCDate(), 17);
      if (openT > now) continue;
      const ic = byT.get(closeT - 36e5), io = byT.get(openT);
      if (ic == null || io == null) continue;
      const cl = hourly[ic].c, op = hourly[io].o, gap = op / cl - 1;
      let filledAt = null;
      for (let k = io; k < hourly.length; k++) { const x = hourly[k]; if (x.l <= cl && x.h >= cl) { filledAt = x.t; break; } }
      out.push({ closeT, openT, close: cl, open: op, gap, filledAt, hoursToFill: filledAt != null ? Math.max(0, Math.round((filledAt - openT) / 36e5)) : null });
    }
    return out;
  }

  // 8 · ETF: racha, sumas y qué hizo BTC 5 días después de rachas de 5+ días de entradas.
  function etf(flows, dailyBtc, minStreak = 5, fwd = 5) {
    const f = [...flows].sort((a, b) => a.t - b.t);
    let streak = 0, sign = Math.sign(f[f.length - 1]?.net || 0);
    for (let k = f.length - 1; k >= 0 && Math.sign(f[k].net) === sign && sign !== 0; k--) streak++;
    const sum = (n) => f.slice(-n).reduce((a, b) => a + b.net, 0);
    const close = new Map(dailyBtc.map((d) => [new Date(d.t).toISOString().slice(0, 10), d.c]));
    const dates = dailyBtc.map((d) => new Date(d.t).toISOString().slice(0, 10));
    const fwdRet = (day) => { const i = dates.indexOf(day); return i >= 0 && i + fwd < dates.length ? dailyBtc[i + fwd].c / dailyBtc[i].c - 1 : NaN; };
    let run = 0; const after = [], all = [];
    for (const x of f) {
      run = x.net > 0 ? run + 1 : 0;
      const r = fwdRet(x.date); if (!isFinite(r)) continue;
      all.push(r); if (run >= minStreak) after.push(r);
    }
    return { streak, sign, sum7: sum(7), sum30: sum(30), last7: f.slice(-7), afterAvg: mean(after), baseAvg: mean(all), n: after.length, closeKnown: close.size };
  }

  root.CtxMath = { mean, median, std, smaAt, regime, volRegime, change, atr, activity, breadth, relative, chicagoToUtc, cmeGaps, etf };
})(typeof window !== 'undefined' ? window : globalThis);
