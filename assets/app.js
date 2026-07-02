'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const DATA_BASE = 'data/';
const PLOTLY_CONF = { displayModeBar: false, responsive: true };
const DARK_LAYOUT = {
  paper_bgcolor: '#161b22', plot_bgcolor: '#161b22',
  font: { family: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#e6edf3', size: 12 },
  xaxis: { gridcolor: '#21262d', zerolinecolor: '#30363d' },
  yaxis: { gridcolor: '#21262d', zerolinecolor: '#30363d' },
  margin: { t: 20, r: 10, b: 40, l: 10 },
  hoverlabel: { bgcolor: '#0d1117', bordercolor: '#30363d', font: { color: '#e6edf3' } },
  legend: { bgcolor: 'rgba(0,0,0,0)', bordercolor: '#30363d', borderwidth: 1, font: { size: 11 } },
};

let DATA = {};

// ── Fetch helpers ────────────────────────────────────────────────────────────
async function fetchJSON(name) {
  const url = DATA_BASE + name + '?v=' + Date.now();
  const r = await fetch(url);
  if (!r.ok) throw new Error('Failed to fetch ' + name);
  return r.json();
}

// ── Tab switching ────────────────────────────────────────────────────────────
function activateTab(tabName) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#mainTabs .nav-link').forEach(l => l.classList.remove('active'));
  const pane = document.getElementById('tab-' + tabName);
  if (pane) pane.classList.add('active');
  const link = document.querySelector(`[data-tab="${tabName}"]`);
  if (link) link.classList.add('active');
  if (location.hash.replace('#', '') !== tabName) {
    history.replaceState(null, '', '#' + tabName);
  }
  renderTab(tabName);
}

let renderedTabs = new Set();
function renderTab(tabName) {
  if (renderedTabs.has(tabName)) return;
  renderedTabs.add(tabName);
  if (tabName === 'probs')        renderProbs();
  if (tabName === 'groups')       renderGroups();
  if (tabName === 'knockout')     renderKnockout();
  if (tabName === 'third')        renderScenarios();
  if (tabName === 'team')         initTeamView();
  if (tabName === 'players')      renderPlayers();
  if (tabName === 'methodology')  renderSimsCharts();
}

// ── Colours ───────────────────────────────────────────────────────────────────
const CONF_COLORS = {
  UEFA: '#58a6ff', CONMEBOL: '#3fb950', CONCACAF: '#f97316',
  CAF: '#d29922', AFC: '#bc8cff', OFC: '#8b949e', Other: '#6e7681',
};

// ── Sortable tables ───────────────────────────────────────────────────────────
function makeSortable(table) {
  const headers = table.querySelectorAll('thead th');
  headers.forEach((th, colIdx) => {
    if (th.dataset.nosort) return;
    th.classList.add('sortable-th');
    th.innerHTML += '<span class="sort-icon">⇅</span>';
    let asc = null;
    th.addEventListener('click', () => {
      asc = asc === true ? false : true;
      headers.forEach(h => h.querySelector('.sort-icon') && (h.querySelector('.sort-icon').textContent = '⇅'));
      th.querySelector('.sort-icon').textContent = asc ? '↑' : '↓';
      const tbody = table.querySelector('tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {
        const aText = (a.cells[colIdx]?.textContent || '').trim();
        const bText = (b.cells[colIdx]?.textContent || '').trim();
        const aNum = parseFloat(aText.replace(/[%+]/g, ''));
        const bNum = parseFloat(bText.replace(/[%+]/g, ''));
        const numCmp = isNaN(aNum) || isNaN(bNum) ? 0 : (aNum - bNum);
        const cmp = numCmp !== 0 ? numCmp : aText.localeCompare(bText);
        return asc ? cmp : -cmp;
      });
      rows.forEach(r => tbody.appendChild(r));
    });
  });
}

// ── Market-odds helpers ──────────────────────────────────────────────────────
const SRC_COLORS = { model: '#58a6ff', poly: '#bc8cff', kalshi: '#3fb950' };

function marketFor(team) {
  const w = (DATA.market && DATA.market.winner) || {};
  return w[team] || null;
}
// consensus = mean of available market sources (null if none)
function consensusOf(m) {
  if (!m) return null;
  const vals = [m.poly, m.kalshi].filter(v => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
function fmtPct1(v) { return v == null ? '—' : (v * 100).toFixed(1) + '%'; }

function edgeCell(model, cons) {
  if (cons == null) return '<span style="color:var(--text3)">—</span>';
  const d = (model - cons) * 100;
  const a = Math.abs(d);
  let color = 'var(--text3)', arrow = '=';
  if (a >= 0.5) { color = d > 0 ? 'var(--green)' : 'var(--red)'; arrow = d > 0 ? '▲' : '▼'; }
  return `<span style="color:${color};font-weight:600">${arrow} ${d >= 0 ? '+' : ''}${d.toFixed(1)}</span>`;
}

function updateMarketStale(market) {
  const stale = market && market.ok === false;
  const txt = stale ? '⚠ market odds temporarily unavailable (showing last known)' : '';
  ['market-stale-probs', 'market-stale-bracket', 'market-stale-players'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  });
}

// ── TAB 1: WIN PROBS ─────────────────────────────────────────────────────────
function renderProbs() {
  const { probs } = DATA;
  const teams = probs.teams;

  // ── Three-way comparison table (winner) ────────────────────────────────────
  // All teams shown; eliminated teams sit at the bottom (p_win = 0), greyed and
  // tagged so it's unambiguous their win probability is 0.
  const live = teams.filter(t => !t.eliminated);
  const cmpBody = document.getElementById('cmp-table-body');
  cmpBody.innerHTML = '';
  const maxModel = Math.max(...live.map(t => t.p_win), 0.0001);
  teams.forEach(t => {
    const m = marketFor(t.team);
    const cons = consensusOf(m);
    const elim = t.eliminated;
    const barW = elim ? 0 : (t.p_win / maxModel) * 100;
    const tr = document.createElement('tr');
    if (elim) tr.className = 'cmp-elim';
    const nameCell = elim
      ? `<td><span style="color:${CONF_COLORS[t.confederation]};margin-right:6px;opacity:0.5">■</span>
          <span class="cmp-elim-name">${t.team}</span>
          <span class="cmp-elim-tag">Eliminated</span></td>`
      : `<td><span style="color:${CONF_COLORS[t.confederation]};margin-right:6px">■</span>
          <strong>${t.team}</strong>
          <span style="font-size:0.7rem;color:var(--text3);margin-left:4px">#${t.fifa_rank}</span></td>`;
    tr.innerHTML = `
      ${nameCell}
      <td class="td-num cmp-model">
        <div class="cmp-bar" style="width:${barW}%"></div>
        <span class="cmp-model-v">${elim ? '0.0%' : fmtPct1(t.p_win)}</span>
      </td>
      <td class="td-num" style="color:${SRC_COLORS.poly}">${m ? fmtPct1(m.poly) : '—'}</td>
      <td class="td-num" style="color:${SRC_COLORS.kalshi}">${m ? fmtPct1(m.kalshi) : '—'}</td>
      <td class="td-num" style="color:var(--text2)">${fmtPct1(cons)}</td>
      <td class="td-num">${elim ? '<span style="color:var(--text3)">—</span>' : edgeCell(t.p_win, cons)}</td>
    `;
    cmpBody.appendChild(tr);
  });
  const cmpTbl = cmpBody.closest('table');
  if (cmpTbl) makeSortable(cmpTbl);

  // ── Lollipop chart: Model vs market consensus, top 18 by model ─────────────
  const top = live.slice(0, 18).reverse();   // reverse so highest is at top
  const names = top.map(t => t.team);
  const modelX  = top.map(t => +(t.p_win * 100).toFixed(2));
  const polyX   = top.map(t => { const m = marketFor(t.team); return m && m.poly != null ? +(m.poly * 100).toFixed(2) : null; });
  const kalshiX = top.map(t => { const m = marketFor(t.team); return m && m.kalshi != null ? +(m.kalshi * 100).toFixed(2) : null; });
  const consX   = top.map(t => { const c = consensusOf(marketFor(t.team)); return c != null ? +(c * 100).toFixed(2) : null; });

  // Connector lines (model ↔ consensus) as shapes
  const shapes = names.map((nm, i) => {
    if (consX[i] == null) return null;
    return {
      type: 'line', x0: modelX[i], x1: consX[i], y0: nm, y1: nm,
      line: { color: '#30363d', width: 2 }, layer: 'below',
    };
  }).filter(Boolean);

  const tModel = {
    type: 'scatter', mode: 'markers', name: 'Model',
    y: names, x: modelX,
    marker: { color: SRC_COLORS.model, size: 13, line: { color: '#0d1117', width: 1 } },
    hovertemplate: '<b>%{y}</b><br>Model: %{x:.1f}%<extra></extra>',
  };
  const tPoly = {
    type: 'scatter', mode: 'markers', name: 'Polymarket',
    y: names, x: polyX,
    marker: { color: SRC_COLORS.poly, size: 10, symbol: 'diamond', line: { color: '#0d1117', width: 1 } },
    hovertemplate: '<b>%{y}</b><br>Polymarket: %{x:.1f}%<extra></extra>',
  };
  const tKalshi = {
    type: 'scatter', mode: 'markers', name: 'Kalshi',
    y: names, x: kalshiX,
    marker: { color: SRC_COLORS.kalshi, size: 10, symbol: 'square', line: { color: '#0d1117', width: 1 } },
    hovertemplate: '<b>%{y}</b><br>Kalshi: %{x:.1f}%<extra></extra>',
  };

  const layout = {
    ...DARK_LAYOUT,
    margin: { t: 10, r: 20, b: 44, l: 110 },
    height: 620,
    shapes,
    xaxis: { ...DARK_LAYOUT.xaxis, ticksuffix: '%', title: { text: 'Win Probability', font: { size: 11 } }, rangemode: 'tozero' },
    yaxis: { ...DARK_LAYOUT.yaxis, automargin: true, tickfont: { size: 11.5 } },
    legend: { ...DARK_LAYOUT.legend, orientation: 'h', x: 0.5, xanchor: 'center', y: 1.06 },
    hovermode: 'closest',
  };
  Plotly.newPlot('chart-probs', [tModel, tPoly, tKalshi], layout, PLOTLY_CONF);

  // Stage probability table — all 48 teams, sortable
  const tbody = document.getElementById('probs-table-body');
  tbody.innerHTML = '';
  const pct = v => (v * 100).toFixed(1) + '%';
  // For tiny but nonzero probs that round to 0.0%, show "<0.1%" so it's clear the team isn't eliminated.
  const fmtP = v => {
    if (v === 0) return '<span style="color:var(--text3);font-style:italic">Elim.</span>';
    if (v < 0.001) return '<span style="color:var(--text3)">&lt;0.1%</span>';
    return pct(v);
  };
  teams.forEach((t, idx) => {
    const tr = document.createElement('tr');
    if (t.eliminated) tr.style.opacity = '0.45';
    tr.innerHTML = `
      <td><span style="color:${CONF_COLORS[t.confederation]};margin-right:6px">■</span>
          <strong>${t.team}</strong>
          <span style="font-size:0.7rem;color:var(--text3);margin-left:4px">#${t.fifa_rank}</span></td>
      <td class="td-num">${fmtP(t.p_r32)}</td>
      <td class="td-num">${t.eliminated ? '—' : pct(t.p_r16)}</td>
      <td class="td-num">${t.eliminated ? '—' : pct(t.p_qf)}</td>
      <td class="td-num">${t.eliminated ? '—' : pct(t.p_sf)}</td>
      <td class="td-num">${t.eliminated ? '—' : pct(t.p_final)}</td>
      <td class="td-num" style="color:${t.eliminated ? 'var(--text3)' : 'var(--blue)'};font-weight:600">${t.eliminated ? '—' : pct(t.p_win)}</td>
    `;
    tbody.appendChild(tr);
  });

  const tbl = document.getElementById('probs-table-body').closest('table');
  if (tbl) makeSortable(tbl);
}

// ── TAB 2: GROUPS ────────────────────────────────────────────────────────────
function qDot(p) {
  if (p >= 0.995) return 'q-confirmed';
  if (p >= 0.70)  return 'q-likely';
  if (p >= 0.10)  return 'q-borderline';
  return 'q-eliminated';
}

function renderGroups() {
  const { groups } = DATA;
  const grid = document.getElementById('groups-grid');
  grid.innerHTML = '';

  Object.entries(groups.groups).sort((a, b) => a[0].localeCompare(b[0])).forEach(([grp, gdata]) => {
    const card = document.createElement('div');
    card.className = 'group-card';

    const gamesText = gdata.is_complete ? 'Complete' : `${gdata.games_played}/6 played`;
    let html = `<div class="group-card-header">Group ${grp} &nbsp;<span style="font-weight:400;font-size:0.65rem;color:var(--text3)">${gamesText}</span></div>`;

    html += `<table class="wc-table">
      <thead><tr>
        <th style="width:16px" data-nosort></th><th></th>
        <th class="td-num">P</th><th class="td-num">W</th><th class="td-num">D</th><th class="td-num">L</th>
        <th class="td-num">GD</th><th class="td-num">Pts</th><th class="td-num">Q%</th>
      </tr></thead><tbody>`;

    gdata.standings.forEach(row => {
      const dotCls = qDot(row.p_qualify);
      const nameStyle = row.p_qualify >= 0.995 ? 'color:var(--blue);font-weight:600' : '';
      const gdStr = row.gd >= 0 ? '+' + row.gd : '' + row.gd;
      html += `<tr>
        <td><span class="q-badge ${dotCls}"></span></td>
        <td style="${nameStyle}">${row.team}</td>
        <td class="td-num" style="color:var(--text3)">${row.played}</td>
        <td class="td-num">${row.won}</td><td class="td-num">${row.drawn}</td><td class="td-num">${row.lost}</td>
        <td class="td-num">${gdStr}</td>
        <td class="td-num" style="font-weight:600">${row.pts}</td>
        <td class="td-num" style="color:var(--text2)">${(row.p_qualify * 100).toFixed(0)}%</td>
      </tr>`;
    });

    html += '</tbody></table>';

    const done = gdata.fixtures.filter(f => f.done);
    const sched = gdata.fixtures.filter(f => !f.done);
    if (done.length) {
      html += `<div style="padding:4px 8px;border-top:1px solid var(--border)">`;
      done.forEach(f => {
        html += `<div style="font-size:0.73rem;color:var(--text2);padding:2px 0">
          ${f.home} <span style="color:var(--text);font-weight:600">${f.home_goals}–${f.away_goals}</span> ${f.away}
        </div>`;
      });
      html += '</div>';
    }
    if (sched.length) {
      html += `<div style="padding:4px 8px;border-top:1px solid var(--border)">`;
      sched.forEach(f => {
        html += `<div style="font-size:0.72rem;color:var(--text3);padding:2px 0">
          ${f.home} vs ${f.away}
        </div>`;
      });
      html += '</div>';
    }

    card.innerHTML = html;
    grid.appendChild(card);

    // Make group table sortable (skip the dot column)
    const tbl = card.querySelector('.wc-table');
    if (tbl) makeSortable(tbl);
  });
}

// ── TAB 3: KNOCKOUT BRACKET ──────────────────────────────────────────────────

// Country flag codes (flagcdn.com 2-letter ISO)
const TEAM_FLAG = {
  "Albania": "al", "Algeria": "dz", "Argentina": "ar", "Australia": "au",
  "Austria": "at", "Bahrain": "bh", "Belgium": "be", "Bolivia": "bo",
  "Bosnia-Herzegovina": "ba", "Brazil": "br", "Burkina Faso": "bf",
  "Cameroon": "cm", "Canada": "ca", "Cape Verde": "cv", "Chile": "cl",
  "Colombia": "co", "Costa Rica": "cr", "Croatia": "hr", "Cuba": "cu",
  "Curacao": "cw", "Czech Republic": "cz", "DR Congo": "cd", "Denmark": "dk",
  "Ecuador": "ec", "Egypt": "eg", "El Salvador": "sv", "England": "gb-eng",
  "Fiji": "fj", "France": "fr", "Georgia": "ge", "Germany": "de",
  "Ghana": "gh", "Haiti": "ht", "Honduras": "hn", "Hungary": "hu",
  "Indonesia": "id", "Iran": "ir", "Iraq": "iq", "Ivory Coast": "ci",
  "Jamaica": "jm", "Japan": "jp", "Jordan": "jo", "Mali": "ml",
  "Mexico": "mx", "Morocco": "ma", "Netherlands": "nl", "New Zealand": "nz",
  "Nigeria": "ng", "Norway": "no", "Oman": "om", "Panama": "pa",
  "Papua New Guinea": "pg", "Paraguay": "py", "Peru": "pe", "Poland": "pl",
  "Portugal": "pt", "Qatar": "qa", "Romania": "ro", "Saudi Arabia": "sa",
  "Scotland": "gb-sct", "Senegal": "sn", "Serbia": "rs", "Slovakia": "sk",
  "Slovenia": "si", "South Africa": "za", "South Korea": "kr", "Spain": "es",
  "Sweden": "se", "Switzerland": "ch", "Syria": "sy", "Tunisia": "tn",
  "Turkey": "tr", "UAE": "ae", "Ukraine": "ua", "Uruguay": "uy",
  "USA": "us", "Uzbekistan": "uz", "Venezuela": "ve", "Vietnam": "vn",
};

// R16 pairings (r32 indices): matches M89-M96
const R16_PAIRS = [
  [1, 4],   // M89
  [0, 2],   // M90
  [3, 5],   // M91
  [6, 7],   // M92
  [10, 11], // M93
  [8, 9],   // M94
  [13, 15], // M95
  [12, 14], // M96
];
const QF_PAIRS = [[0, 1], [4, 5], [2, 3], [6, 7]]; // M97-M100

// Each half: r32_order = R32 indices top-to-bottom; feeds R16/QF/SF in order
const BRACKET_HALVES = [
  { r32_order: [1, 4, 0, 2, 10, 11, 8, 9],   r16_order: [0, 1, 4, 5], qf_order: [0, 1], sf_idx: 0 },
  { r32_order: [3, 5, 6, 7, 13, 15, 12, 14], r16_order: [2, 3, 6, 7], qf_order: [2, 3], sf_idx: 1 },
];

function renderKnockout() {
  const r32 = DATA.bracket.r32;
  const container = document.getElementById('bracket-tree');
  container.innerHTML = '';

  // Single left-to-right bracket: R32 -> R16 -> QF -> SF -> Final
  // Each group of 2 R32 indices feeds one R16 match.
  const R32_GROUPS = [[1,4],[0,2],[10,11],[8,9],[3,5],[6,7],[13,15],[12,14]];
  const R16_IDS    = [89, 90, 93, 94, 91, 92, 95, 96];   // parallel to R32_GROUPS
  const R16_GROUPS = [[89,90],[93,94],[91,92],[95,96]];   // each pair feeds one QF
  const QF_IDS     = [97, 98, 99, 100];
  const QF_GROUPS  = [[97,98],[99,100]];                  // each pair feeds one SF

  // ── helpers ────────────────────────────────────────────────────────────────
  function flagImg(name) {
    const code = TEAM_FLAG[name];
    return code
      ? `<img class="bc-flag" src="https://flagcdn.com/20x15/${code}.png" alt="" loading="lazy" onerror="this.style.display='none'">`
      : '<span style="width:20px;height:15px;display:inline-block;flex-shrink:0"></span>';
  }

  function isConfirmedSlot(teams) {
    const v = teams.filter(t => t.p >= 0.03);
    return v.length === 1 && v[0].p >= 0.9999;
  }

  // Win probs only shown once every single R32 slot is confirmed.
  const allR32Confirmed = r32.every(gm =>
    isConfirmedSlot(gm.slot_a_teams || []) && isConfirmedSlot(gm.slot_b_teams || [])
  );

  // ── reach-round lookups (model + market) ───────────────────────────────────
  // Model reach probs from probs.json; market reach from market_odds.json.
  const modelReach = {};   // team -> {r16,qf,sf,final,win}
  (DATA.probs.teams || []).forEach(t => {
    modelReach[t.team] = { r16: t.p_r16, qf: t.p_qf, sf: t.p_sf, final: t.p_final, win: t.p_win };
  });
  const mktReach = (DATA.market && DATA.market.reach) || {};
  const mktWinner = (DATA.market && DATA.market.winner) || {};

  // Raw Kalshi reach prob for a team at a given round (null if unavailable).
  function kalshiReach(team, roundKey) {
    if (roundKey === 'win') {
      const w = mktWinner[team];
      return w && w.kalshi != null ? w.kalshi : null;
    }
    const r = mktReach[roundKey] && mktReach[roundKey][team];
    return r && r.kalshi != null ? r.kalshi : null;
  }

  // Render Model + Kalshi reach numbers for one team from pre-computed display
  // integers (already pairwise-rounded to sum to 100). Polymarket is excluded.
  function reachNums(disp) {
    if (!disp) return '';
    const parts = [];
    if (disp.model != null) parts.push(`<span class="bc-rnum bc-src-model">${disp.model}</span>`);
    if (disp.kal   != null) parts.push(`<span class="bc-rnum bc-src-kalshi">${disp.kal}</span>`);
    if (!parts.length) return '';
    return `<span class="bc-reach">${parts.join('<span class="bc-rdot">·</span>')}</span>`;
  }

  // Confirmed slot → show reach-next-round (Model · Kalshi). Unconfirmed → slot %.
  // `disp` carries the pre-rounded {model, kal} integers for the confirmed team.
  function slotRow(teams, disp) {
    const visible = teams.filter(t => t.p >= 0.03);
    if (!visible.length) return '<div class="bc-slot-row"><span class="bc-tbd-inline">TBD</span></div>';
    const confirmed = isConfirmedSlot(teams);
    const parts = visible.map(t => {
      let extra = '';
      if (confirmed && disp) {
        extra = reachNums(disp);
      } else if (!confirmed) {
        extra = `<span class="bc-inline-pct bc-ipct-slot">(${(t.p * 100).toFixed(0)}%)</span>`;
      }
      const nc = confirmed ? 'bc-name bc-conf-name' : 'bc-name';
      return `<span class="bc-inline-team">${flagImg(t.team)}<span class="${nc}">${t.team}</span>${extra}</span>`;
    });
    return `<div class="bc-slot-row">${parts.join('<span class="bc-sep">/</span>')}</div>`;
  }

  // For a confirmed two-team match, compute display integers for both teams so
  // that each metric (model, Kalshi) sums to exactly 100 across the pair.
  // Kalshi is pairwise de-vigged (a knockout match has exactly one advancer).
  // Returns {a:{model,kal}, b:{model,kal}}.
  function pairDisplay(teamA, teamB, roundKey) {
    const mA = modelReach[teamA] ? modelReach[teamA][roundKey] : null;
    const mB = modelReach[teamB] ? modelReach[teamB][roundKey] : null;
    const kA = kalshiReach(teamA, roundKey);
    const kB = kalshiReach(teamB, roundKey);

    // Complementary rounding: round team A, set team B = 100 − A, so the pair
    // always sums to exactly 100.
    function split(a, b) {
      if (a == null && b == null) return [null, null];
      if (a == null) return [null, Math.round(b * 100)];
      if (b == null) return [Math.round(a * 100), null];
      const s = a + b;                  // de-vig (model already ~1; Kalshi may not be)
      const ai = Math.round((a / s) * 100);
      return [ai, 100 - ai];
    }
    const [maI, mbI] = split(mA, mB);
    const [kaI, kbI] = split(kA, kB);
    return { a: { model: maI, kal: kaI }, b: { model: mbI, kal: kbI } };
  }

  function r32Card(gm) {
    const slotA = gm.slot_a_teams || [], slotB = gm.slot_b_teams || [];
    // R32 winners advance to the Round of 16.
    let dispA = null, dispB = null;
    const aConf = isConfirmedSlot(slotA), bConf = isConfirmedSlot(slotB);
    const winner = koWinners[gm.match_id];
    // Decided match → result-only (winner highlighted, no probabilities).
    if (winner && aConf && bConf) {
      const tA = slotA.find(t => t.p >= 0.03).team;
      const tB = slotB.find(t => t.p >= 0.03).team;
      const lbl = `${gm.match_id} &middot; <span class="bc-slot-lbl">${gm.slot_a} vs ${gm.slot_b}</span>`;
      return resultCard(gm.match_id, tA, tB, winner, null, lbl);
    }
    if (aConf && bConf) {
      const tA = slotA.find(t => t.p >= 0.03).team;
      const tB = slotB.find(t => t.p >= 0.03).team;
      const pd = pairDisplay(tA, tB, 'r16');
      dispA = pd.a; dispB = pd.b;
    } else {
      // Only one side confirmed: show its raw (un-normalised) numbers.
      if (aConf) { const t = slotA.find(x => x.p >= 0.03).team; dispA = rawDisplay(t, 'r16'); }
      if (bConf) { const t = slotB.find(x => x.p >= 0.03).team; dispB = rawDisplay(t, 'r16'); }
    }
    return `<div class="bc-game">
      <div class="bc-label">${gm.match_id} &middot; <span class="bc-slot-lbl">${gm.slot_a} vs ${gm.slot_b}</span></div>
      ${slotRow(slotA, dispA)}
      <div class="bc-slot-div"></div>
      ${slotRow(slotB, dispB)}
    </div>`;
  }

  function rawDisplay(team, roundKey) {
    const m = modelReach[team] ? modelReach[team][roundKey] : null;
    const k = kalshiReach(team, roundKey);
    return { model: m != null ? Math.round(m * 100) : null, kal: k != null ? Math.round(k * 100) : null };
  }

  function tbdCard(mid, a, b, cls) {
    return `<div class="bc-game${cls ? ' '+cls : ''}">
      <div class="bc-label">${mid}</div>
      <div class="bc-tbd-row">${a}</div>
      <div class="bc-tbd-row">${b}</div>
    </div>`;
  }

  // A later-round card (R16→Final). Once both teams are resolved from played
  // results it renders them with reach-next-round odds (Model · Kalshi, pairwise
  // de-vigged); with one side known it shows that team + TBD; otherwise it falls
  // back to the "Winner of M__" placeholder.
  const koResolved = (DATA.bracket && DATA.bracket.ko_resolved) || {};
  const koWinners  = (DATA.bracket && DATA.bracket.ko_winners) || {};
  const koScores   = (DATA.bracket && DATA.bracket.ko_scores) || {};
  function koTeamLineHtml(team, disp) {
    return `<div class="bc-slot-row"><span class="bc-inline-team">${flagImg(team)}<span class="bc-name bc-conf-name">${team}</span>${reachNums(disp)}</span></div>`;
  }

  // A decided match: winner highlighted, loser greyed, no probabilities.
  // The final scoreline sits in its own right-aligned column so it never reads
  // as a probability. (Forward-looking odds appear on the winner's next card.)
  function resultLineHtml(team, isWinner, goals) {
    const cls = isWinner ? 'bc-ko-won' : 'bc-ko-lost';
    const tick = isWinner ? '<span class="bc-ko-tick">✓</span>' : '';
    const scoreHtml = goals != null
      ? `<span class="bc-score${isWinner ? ' bc-score-win' : ''}">${goals}</span>`
      : '';
    return `<div class="bc-slot-row ${cls}"><span class="bc-inline-team">${flagImg(team)}<span class="bc-name bc-conf-name">${team}</span>${tick}</span>${scoreHtml}</div>`;
  }
  function resultCard(matchId, teamA, teamB, winner, cls, label) {
    const clsAttr = cls ? ' ' + cls : '';
    const lbl = label || matchId;
    const sc = koScores[matchId] || {};
    return `<div class="bc-game${clsAttr}">
      <div class="bc-label">${lbl}</div>
      ${resultLineHtml(teamA, teamA === winner, sc[teamA])}
      <div class="bc-slot-div"></div>
      ${resultLineHtml(teamB, teamB === winner, sc[teamB])}
    </div>`;
  }
  function koCard(mid, fallbackA, fallbackB, nextRound, cls, label) {
    const clsAttr = cls ? ' ' + cls : '';
    const lbl = label || `M${mid}`;
    const pair = koResolved[`M${mid}`] || [null, null];
    const tA = pair[0], tB = pair[1];
    const winner = koWinners[`M${mid}`];
    // Decided match → result-only (winner highlighted, no probabilities).
    if (winner && tA && tB) {
      return resultCard(`M${mid}`, tA, tB, winner, cls, label);
    }
    if (tA && tB) {
      const pd = pairDisplay(tA, tB, nextRound);
      return `<div class="bc-game${clsAttr}">
        <div class="bc-label">${lbl}</div>
        ${koTeamLineHtml(tA, pd.a)}
        <div class="bc-slot-div"></div>
        ${koTeamLineHtml(tB, pd.b)}
      </div>`;
    }
    if (tA || tB) {
      const known = tA || tB;
      const knownLine = koTeamLineHtml(known, rawDisplay(known, nextRound));
      const tbdLine = `<div class="bc-tbd-row">${tA ? fallbackB : fallbackA}</div>`;
      return `<div class="bc-game${clsAttr}">
        <div class="bc-label">${lbl}</div>
        ${tA ? knownLine : tbdLine}
        <div class="bc-slot-div"></div>
        ${tA ? tbdLine : knownLine}
      </div>`;
    }
    return tbdCard(lbl, fallbackA, fallbackB, cls);
  }

  function connectors(n) {
    const el = document.createElement('div');
    el.className = 'bc-connectors';
    let h = '<div class="bc-conn-spacer"></div>';
    for (let i = 0; i < n; i++) h += '<div class="bc-conn-pair"><div class="bc-conn-top"></div><div class="bc-conn-bot"></div></div>';
    el.innerHTML = h;
    return el;
  }

  function mkCol(cls, label, innerHtml) {
    const el = document.createElement('div');
    el.className = 'bc-col ' + cls;
    const lbl = document.createElement('div');
    lbl.className = 'bc-round-label';
    lbl.textContent = label;
    el.appendChild(lbl);
    el.innerHTML += innerHtml;
    return el;
  }

  // Each card is wrapped in bc-slot so it's vertically centered in its half of the pair.
  const pr = (...cards) => `<div class="bc-pair">${cards.map(c => `<div class="bc-slot">${c}</div>`).join('')}</div>`;

  // ── R32 ────────────────────────────────────────────────────────────────────
  const r32Html = R32_GROUPS.map(([a,b]) => pr(r32Card(r32[a]), r32Card(r32[b]))).join('');

  // ── R16 ────────────────────────────────────────────────────────────────────
  // R16 winners advance to the Quarter-Final → show reach-QF odds.
  const r16Html = R16_GROUPS.map(([m1,m2], i) => {
    const [a1,b1] = R32_GROUPS[i*2], [a2,b2] = R32_GROUPS[i*2+1];
    return pr(
      koCard(m1, `W ${r32[a1].match_id}`, `W ${r32[b1].match_id}`, 'qf'),
      koCard(m2, `W ${r32[a2].match_id}`, `W ${r32[b2].match_id}`, 'qf')
    );
  }).join('');

  // ── QF ─────────────────────────────────────────────────────────────────────
  // QF winners advance to the Semi-Final → show reach-SF odds.
  const qfHtml = QF_GROUPS.map(([q1,q2], i) => pr(
    koCard(q1, `W M${R16_GROUPS[i*2][0]}`, `W M${R16_GROUPS[i*2][1]}`, 'sf', 'bc-game-qf'),
    koCard(q2, `W M${R16_GROUPS[i*2+1][0]}`, `W M${R16_GROUPS[i*2+1][1]}`, 'sf', 'bc-game-qf')
  )).join('');

  // ── SF ─────────────────────────────────────────────────────────────────────
  // SF winners advance to the Final → show reach-final odds.
  const sfHtml = pr(
    koCard(101, `W M${QF_GROUPS[0][0]}`, `W M${QF_GROUPS[0][1]}`, 'final', 'bc-game-sf'),
    koCard(102, `W M${QF_GROUPS[1][0]}`, `W M${QF_GROUPS[1][1]}`, 'final', 'bc-game-sf')
  );

  // ── Final ──────────────────────────────────────────────────────────────────
  // Final → show win-tournament odds.
  const finHtml = koCard(103, 'W M101', 'W M102', 'win', 'bc-game-final', 'M103 &middot; 19 Jul &middot; MetLife');

  // ── Assemble ───────────────────────────────────────────────────────────────
  [
    mkCol('bc-col-r32',   'Round of 32',   r32Html),
    connectors(8),
    mkCol('bc-col-r16',   'Round of 16',   r16Html),
    connectors(4),
    mkCol('bc-col-qf',    'Quarter-Final', qfHtml),
    connectors(2),
    mkCol('bc-col-sf',    'Semi-Final',    sfHtml),
    connectors(1),
    mkCol('bc-col-final', 'Final',         finHtml),
  ].forEach(el => container.appendChild(el));
}
// ── METHODOLOGY: SIMULATION COUNT CHARTS ─────────────────────────────────────
function renderSimsCharts() {
  const ns  = [5000, 10000, 15000, 25000, 50000, 100000, 150000, 200000];
  const lbs = ns.map(n => (n / 1000) + 'K');
  const se  = ns.map(n => parseFloat((0.5 / Math.sqrt(n) * 100).toFixed(3)));
  const rt  = [3, 6, 8, 14, 28, 53, 83, 110];
  const HI  = ns.indexOf(100000); // index 5

  const pick = (hi, lo) => ns.map((_, i) => i === HI ? hi : lo);

  // ── Chart 1: Standard Error curve ─────────────────────────────────────────
  // Two traces: filled area + highlighted markers so 100K stands out.
  Plotly.newPlot('chart-sims-se', [
    {
      x: lbs, y: se,
      type: 'scatter', mode: 'lines',
      fill: 'tozeroy', fillcolor: 'rgba(88,166,255,0.07)',
      line: { color: '#58a6ff', width: 2 },
      hoverinfo: 'skip',
    },
    {
      x: lbs, y: se,
      type: 'scatter', mode: 'markers',
      marker: {
        color: pick('#58a6ff', '#8b949e'),
        size:  pick(11, 6),
        line:  { color: pick('#e6edf3', 'rgba(0,0,0,0)'), width: pick(2, 0) },
      },
      hovertemplate: '<b>%{x}</b> — SE: ±%{y:.2f} pp<extra></extra>',
    },
  ], {
    ...DARK_LAYOUT,
    showlegend: false,
    title: { text: 'Precision: Standard Error vs Simulations', font: { size: 12, color: '#8b949e' }, x: 0.5 },
    margin: { t: 42, r: 18, b: 48, l: 56 },
    xaxis: { ...DARK_LAYOUT.xaxis, title: { text: 'Simulations', font: { size: 11 } }, tickfont: { size: 10 } },
    yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'SE (pp)', font: { size: 11 } }, tickfont: { size: 10 }, ticksuffix: ' pp', rangemode: 'tozero' },
    shapes: [{
      type: 'line', x0: '100K', x1: '100K', y0: 0, y1: 1, xref: 'x', yref: 'paper',
      line: { color: 'rgba(88,166,255,0.45)', width: 1.5, dash: 'dot' },
    }],
    annotations: [{
      x: '100K', y: se[HI],
      text: '<b>100K</b><br>±0.16 pp',
      showarrow: true, arrowhead: 2, arrowsize: 0.9, arrowcolor: '#58a6ff',
      font: { color: '#58a6ff', size: 10 },
      bgcolor: 'rgba(88,166,255,0.12)', bordercolor: 'rgba(88,166,255,0.5)', borderwidth: 1, borderpad: 4,
      ax: 52, ay: -36,
    }],
  }, PLOTLY_CONF);

  // ── Chart 2: Runtime bar chart ────────────────────────────────────────────
  Plotly.newPlot('chart-sims-rt', [{
    x: lbs, y: rt,
    type: 'bar',
    marker: {
      color: pick('rgba(88,166,255,0.75)', 'rgba(48,54,61,0.85)'),
      line: { color: pick('#58a6ff', '#6e7681'), width: 1 },
    },
    text: rt.map(v => v + 's'),
    textposition: 'outside',
    cliponaxis: false,
    textfont: { size: 9.5, color: pick('#58a6ff', '#6e7681') },
    hovertemplate: '<b>%{x}</b> — Runtime: %{y}s<extra></extra>',
  }], {
    ...DARK_LAYOUT,
    showlegend: false,
    title: { text: 'Compute Cost: Runtime per Hourly Run', font: { size: 12, color: '#8b949e' }, x: 0.5 },
    margin: { t: 42, r: 18, b: 48, l: 56 },
    xaxis: { ...DARK_LAYOUT.xaxis, title: { text: 'Simulations', font: { size: 11 } }, tickfont: { size: 10 } },
    yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'Seconds', font: { size: 11 } }, tickfont: { size: 10 }, rangemode: 'tozero' },
    shapes: [{
      type: 'line', x0: '100K', x1: '100K', y0: 0, y1: 1, xref: 'x', yref: 'paper',
      line: { color: 'rgba(88,166,255,0.45)', width: 1.5, dash: 'dot' },
    }],
    annotations: [{
      x: '100K', y: rt[HI],
      text: '<b>100K</b><br>53s / run',
      showarrow: true, arrowhead: 2, arrowsize: 0.9, arrowcolor: '#58a6ff',
      font: { color: '#58a6ff', size: 10 },
      bgcolor: 'rgba(88,166,255,0.12)', bordercolor: 'rgba(88,166,255,0.5)', borderwidth: 1, borderpad: 4,
      ax: 52, ay: -36,
    }],
  }, PLOTLY_CONF);
}

// ── 3RD PLACE LIVE TRACKER ───────────────────────────────────────────────────
function renderThirdPlaceTracker() {
  const { groups, probs } = DATA;
  const groupData = groups.groups;
  // Build lookup: team → p_r32 (probability of reaching R32 via any path)
  const pQualLookup = {};
  (probs.teams || []).forEach(t => { pQualLookup[t.team] = t.p_r32; });
  const allGroups = ['A','B','C','D','E','F','G','H','I','J','K','L'];

  // Take the current 3rd-place team from every group (complete or in-progress)
  // pos values in standings are 1-indexed
  const thirds = allGroups.map(grp => {
    const g = groupData[grp];
    if (!g || !g.standings || g.standings.length < 3) return { group: grp, hasData: false };
    // standings are sorted by current position; 3rd is index 2
    const row = g.standings[2];
    return {
      group: grp,
      hasData: true,
      done: g.is_complete,
      team: row.team,
      played: row.played,
      pts: row.pts,
      gd: row.gd,
      gf: row.gf,
      ga: row.ga,
    };
  });

  // Rank all 12 by 3rd-place tiebreaker: pts → GD → GF
  const ranked = [...thirds].sort((a, b) => {
    if (!a.hasData && !b.hasData) return 0;
    if (!a.hasData) return 1;
    if (!b.hasData) return -1;
    return (b.pts - a.pts) || (b.gd - a.gd) || (b.gf - a.gf);
  });

  const wrap = document.getElementById('third-tracker-wrap');
  if (!wrap) return;

  let html = `<div class="card mb-3">
    <div class="card-header">Current 3rd-Place Race — Best 8 Advance</div>
    <div class="card-body" style="padding:0">
      <table class="wc-table">
        <thead><tr>
          <th data-nosort style="width:36px">#</th>
          <th data-nosort>Grp</th>
          <th>Team</th>
          <th class="td-num">P</th>
          <th class="td-num">Pts</th>
          <th class="td-num">GD</th>
          <th class="td-num">GF</th>
          <th class="td-num">GA</th>
          <th class="td-num">P(Q)</th>
          <th data-nosort style="text-align:center">Status</th>
        </tr></thead>
        <tbody>`;

  ranked.forEach((r, i) => {
    const rank = i + 1;
    const isIn = rank <= 8;
    const isCutline = rank === 9; // first team OUT

    // Draw the cutline separator before position 9
    if (isCutline) {
      html += `<tr>
        <td colspan="9" style="padding:0;border-bottom:2px dashed var(--red);position:relative">
          <span style="position:absolute;right:10px;top:-9px;font-size:0.65rem;color:var(--red);background:var(--bg2);padding:0 4px;font-weight:700">CUTLINE</span>
        </td>
      </tr>`;
    }

    if (!r.hasData) {
      html += `<tr style="opacity:0.35">
        <td style="color:var(--text3)">—</td>
        <td style="color:var(--text3);font-size:0.75rem">${r.group}</td>
        <td colspan="6" style="color:var(--text3)">No data yet</td>
        <td></td><td></td>
      </tr>`;
      return;
    }

    let badge, badgeStyle;
    if (isIn) {
      badge = rank === 8 ? 'IN ●' : 'IN';
      badgeStyle = rank === 8
        ? 'background:rgba(210,153,34,0.18);color:var(--yellow);border:1px solid rgba(210,153,34,0.4)'
        : 'background:rgba(63,185,80,0.15);color:var(--green);border:1px solid rgba(63,185,80,0.3)';
    } else {
      badge = 'OUT';
      badgeStyle = 'background:rgba(248,81,73,0.15);color:var(--red);border:1px solid rgba(248,81,73,0.3)';
    }

    const gdStr = r.gd >= 0 ? '+' + r.gd : '' + r.gd;
    const doneTag = r.done ? '' : `<span style="font-size:0.65rem;color:var(--text3);margin-left:5px">(${r.played}gp)</span>`;
    const rowStyle = isIn ? '' : 'opacity:0.7';
    const pq = pQualLookup[r.team];
    const pqStr = pq !== undefined ? (pq * 100).toFixed(0) + '%' : '—';
    const pqColor = pq >= 0.85 ? 'var(--green)' : pq >= 0.50 ? 'var(--yellow)' : pq >= 0.20 ? 'var(--orange)' : 'var(--red)';

    html += `<tr style="${rowStyle}">
      <td style="color:var(--text3);font-weight:600">${rank}</td>
      <td style="color:var(--text3);font-size:0.75rem">${r.group}</td>
      <td style="font-weight:${isIn ? '600' : '400'}">${r.team}${doneTag}</td>
      <td class="td-num" style="color:var(--text3)">${r.played}</td>
      <td class="td-num" style="font-weight:700;color:${isIn ? 'var(--text)' : 'var(--text2)'}">${r.pts}</td>
      <td class="td-num">${gdStr}</td>
      <td class="td-num">${r.gf}</td>
      <td class="td-num">${r.ga}</td>
      <td class="td-num" style="font-weight:600;color:${pqColor}">${pqStr}</td>
      <td style="text-align:center"><span style="font-size:0.70rem;font-weight:700;padding:2px 8px;border-radius:10px;${badgeStyle}">${badge}</span></td>
    </tr>`;
  });

  html += `</tbody></table></div></div>`;
  wrap.innerHTML = html;
}

// ── TAB 4: 3RD PLACE SCENARIOS ───────────────────────────────────────────────
function renderScenarios() {
  renderThirdPlaceTracker();
  const { scenarios } = DATA;
  const rows = scenarios.scenarios;

  const note = document.getElementById('scenario-note');
  note.innerHTML = `
    <strong style="color:var(--blue)">How to read this:</strong>
    Each cell shows the simulation's estimated probability that a 3rd-place team finishing with that
    <em>points total</em> and <em>goal difference</em> would rank among the best 8 of 12 third-place
    finishers and advance to the Round of 32. Higher points and better goal difference improve the
    chances. The heatmap updates after each round as more group results come in.
  `;

  const allPts = [...new Set(rows.map(r => r.pts))].sort((a, b) => b - a);
  const allGd  = [...new Set(rows.map(r => r.gd))].sort((a, b) => a - b);

  const z = allPts.map(pts =>
    allGd.map(gd => {
      const match = rows.find(r => r.pts === pts && r.gd === gd);
      return match ? match.p_qualify : null;
    })
  );

  const trace = {
    type: 'heatmap',
    z,
    x: allGd.map(g => (g >= 0 ? '+' + g : '' + g)),
    y: allPts.map(p => p + ' pts'),
    colorscale: [
      [0.0, '#f85149'],
      [0.3, '#d29922'],
      [0.6, '#3fb950'],
      [1.0, '#58a6ff'],
    ],
    zmin: 0, zmax: 1,
    text: z.map(row => row.map(v => v !== null ? (v * 100).toFixed(0) + '%' : '')),
    texttemplate: '%{text}',
    textfont: { size: 11, color: '#0d1117' },
    hovertemplate: '%{y}, GD %{x}<br>P(qualify): %{text}<extra></extra>',
    showscale: true,
    colorbar: {
      tickformat: '.0%',
      thickness: 14, len: 0.8,
      tickfont: { size: 10, color: '#8b949e' },
      title: { text: '', side: 'right' },
    },
  };

  const layout = {
    ...DARK_LAYOUT,
    margin: { t: 10, r: 80, b: 60, l: 65 },
    xaxis: { ...DARK_LAYOUT.xaxis, title: 'Goal Difference', tickfont: { size: 11 } },
    yaxis: { ...DARK_LAYOUT.yaxis, title: '', tickfont: { size: 11 } },
  };

  Plotly.newPlot('chart-scenarios', [trace], layout, PLOTLY_CONF);

  const tbody = document.getElementById('scenario-table-body');
  tbody.innerHTML = '';
  [...rows].sort((a, b) => b.pts - a.pts || b.gd - a.gd).forEach(row => {
    const pct = (row.p_qualify * 100).toFixed(1) + '%';
    const color = row.p_qualify >= 0.99 ? 'var(--green)'
                : row.p_qualify >= 0.60 ? 'var(--yellow)'
                : row.p_qualify >= 0.20 ? 'var(--orange)'
                : 'var(--red)';
    const gdStr = row.gd >= 0 ? '+' + row.gd : '' + row.gd;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.pts}</td>
      <td>${gdStr}</td>
      <td class="td-num" style="color:${color};font-weight:600">${pct}</td>
    `;
    tbody.appendChild(tr);
  });

  const tbl = document.getElementById('scenario-table-body').closest('table');
  if (tbl) makeSortable(tbl);
}

// ── TAB 5: TEAM VIEW ─────────────────────────────────────────────────────────
function initTeamView() {
  const { probs } = DATA;
  const sel = document.getElementById('team-select');
  probs.teams.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.team;
    opt.textContent = t.team;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => renderTeamView(sel.value));

  // Deep-link: ?team=<name> preselects a team (shareable team links).
  const wanted = new URLSearchParams(location.search).get('team');
  if (wanted && probs.teams.some(t => t.team === wanted)) {
    sel.value = wanted;
    renderTeamView(wanted);
  }
}

function renderTeamView(team) {
  if (!team) return;
  const { probs, bracket } = DATA;
  const teamData = probs.teams.find(t => t.team === team);
  if (!teamData) return;

  const content = document.getElementById('team-view-content');
  const stages = [
    { key: 'p_r32',   label: 'R32' },
    { key: 'p_r16',   label: 'R16' },
    { key: 'p_qf',    label: 'QF' },
    { key: 'p_sf',    label: 'SF' },
    { key: 'p_final', label: 'Final' },
    { key: 'p_win',   label: 'Win' },
  ];

  let html = '';

  // ── Eliminated banner ────────────────────────────────────────────────────
  if (teamData.eliminated) {
    html += `<div class="tv-elim-banner">
      <span style="font-size:1.4rem">❌</span>
      <div>
        <div class="tv-elim-title">${team} — Eliminated</div>
        <div class="tv-elim-sub">No longer in the tournament · win probability 0%</div>
      </div>
    </div>`;
  }

  // ── Path-by-position section ─────────────────────────────────────────────
  const teamPaths = bracket && bracket.team_paths && bracket.team_paths[team];
  if (teamData.eliminated) {
    // Eliminated: skip the forward-looking scenario/stage panels — render the
    // banner only (their probabilities are all 0 and add no information).
    document.getElementById('team-view-content').innerHTML = html;
    return;
  }
  if (teamPaths && teamPaths.p_finish_pos) {
    const pfp = teamPaths.p_finish_pos;        // {1:p, 2:p, 3:p, 4:p}
    const byPos = teamPaths.r32_by_pos || {};   // {1:[{team,p},...], 2:[...], 3:[...]}

    const p1 = pfp['1'] || 0;
    const p2 = pfp['2'] || 0;
    const p3qualify = Math.max(0, teamData.p_r32 - p1 - p2);
    const pElim = Math.max(0, 1 - teamData.p_r32);

    function oppChips(posOpps) {
      if (!posOpps || posOpps.length === 0) return '<span style="color:var(--text3)">—</span>';
      return posOpps.slice(0, 4).map(o =>
        `<span class="pos-opp-chip">${o.team} <span class="pos-opp-p">${(o.p * 100).toFixed(0)}%</span></span>`
      ).join('');
    }

    const scenarios = [
      { label: '1st in Group',        pct: p1,        opps: byPos['1'], color: 'var(--green)', qual: true },
      { label: '2nd in Group',        pct: p2,        opps: byPos['2'], color: 'var(--blue)',  qual: true },
      { label: '3rd (qualifies)',      pct: p3qualify, opps: byPos['3'], color: 'var(--yellow)',qual: true },
      { label: 'Eliminated',          pct: pElim,     opps: null,       color: 'var(--red)',   qual: false },
    ];

    html += `<div class="row g-3"><div class="col-12"><div class="card">
      <div class="card-header">Scenario-Based R32 Path — ${team}</div>
      <div class="card-body" style="padding:0">
        <table class="wc-table pos-path-table">
          <thead><tr>
            <th style="width:180px">Finish Position</th>
            <th style="width:90px" class="td-num">P</th>
            <th style="width:240px">Probability</th>
            <th>Most Likely R32 Opponents</th>
          </tr></thead>
          <tbody>`;

    // Only render scenarios with non-trivial probability (>= 0.5%)
    // so guaranteed qualifiers (e.g. Colombia at 6pts) never show "Eliminated: 0.0%"
    const visibleScenarios = scenarios.filter(s => s.pct >= 0.005);
    visibleScenarios.forEach(s => {
      const barPct = (s.pct * 100).toFixed(1);
      const barW = Math.min(s.pct * 100, 100);
      html += `<tr>
        <td style="font-weight:600;color:${s.color}">${s.label}</td>
        <td class="td-num" style="font-weight:700;color:${s.color}">${barPct}%</td>
        <td>
          <div style="background:var(--bg3);border-radius:3px;height:6px;overflow:hidden">
            <div style="width:${barW}%;height:100%;background:${s.color};border-radius:3px"></div>
          </div>
        </td>
        <td>${s.qual ? oppChips(s.opps) : '<span style="color:var(--text3)">—</span>'}</td>
      </tr>`;
    });

    html += `</tbody></table></div></div></div></div>`;
  }

  // ── Stage probs + opponents row ───────────────────────────────────────────
  html += `<div class="row g-3"><div class="col-md-5">
    <div class="card">
      <div class="card-header">Stage Probabilities — ${team}</div>
      <div class="card-body">`;

  stages.forEach(s => {
    const pct = teamData[s.key] * 100;
    html += `
      <div class="prob-bar-wrap">
        <div class="prob-bar-label">${s.label}</div>
        <div class="prob-bar-track">
          <div class="prob-bar-fill" style="width:${Math.min(pct, 100)}%"></div>
        </div>
        <div class="prob-bar-pct">${pct.toFixed(1)}%</div>
      </div>`;
  });

  html += `</div></div></div>`;

  // Most likely opponents table from bracket.team_paths
  if (teamPaths) {
    const stageOrder = [
      { key: 'r32',   label: 'R32' },
      { key: 'r16',   label: 'R16' },
      { key: 'qf',    label: 'QF' },
      { key: 'sf',    label: 'SF' },
      { key: 'final', label: 'Final' },
    ];

    let rows = '';
    stageOrder.forEach(s => {
      const opps = teamPaths[s.key] || {};
      const sorted = Object.entries(opps).sort((a, b) => b[1] - a[1]).slice(0, 3);
      if (sorted.length === 0) return;
      sorted.forEach(([opp, p], i) => {
        rows += `<tr>
          <td style="${i === 0 ? '' : 'border-top:none;color:transparent;font-size:0;padding-top:0'}">${i === 0 ? s.label : ''}</td>
          <td>${opp}</td>
          <td class="td-num">${(p * 100).toFixed(1)}%</td>
        </tr>`;
      });
    });

    html += `<div class="col-md-7">
      <div class="card">
        <div class="card-header">Most Likely Opponents — ${team}</div>
        <div class="card-body" style="padding:0">
          <table class="wc-table" id="team-opponents-table">
            <thead><tr>
              <th data-nosort>Stage</th>
              <th>Opponent</th>
              <th class="td-num">P(Face)</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  }

  html += `</div>`;
  content.innerHTML = html;

  const oppTable = document.getElementById('team-opponents-table');
  if (oppTable) makeSortable(oppTable);
}

// ── TAB: PLAYERS ──────────────────────────────────────────────────────────────
function playerFlag(team) {
  const code = TEAM_FLAG[team];
  return code
    ? `<img class="bc-flag" src="https://flagcdn.com/20x15/${code}.png" alt="" loading="lazy" onerror="this.style.display='none'">`
    : '<span style="width:20px;height:15px;display:inline-block"></span>';
}

let playersRendered = false;
function renderPlayers() {
  renderBootRace();
  renderLiveLeaders();
  if (!playersRendered) { initHistoricalCompare(); playersRendered = true; }
}

// Section 1: Golden Boot race — Model vs Poly vs Kalshi + Edge, table + lollipop
function renderBootRace() {
  const rows = (DATA.playerLeaders && DATA.playerLeaders.golden_boot) || [];
  const body = document.getElementById('boot-table-body');
  body.innerHTML = '';
  const maxModel = Math.max(...rows.map(r => r.model || 0), 0.0001);
  rows.forEach(r => {
    const cons = consensusOf({ poly: r.poly, kalshi: r.kalshi });
    const barW = ((r.model || 0) / maxModel) * 100;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${playerFlag(r.team)}<strong style="margin-left:6px">${r.name}</strong>
          <span style="font-size:0.7rem;color:var(--text3);margin-left:5px">${r.team}</span></td>
      <td class="td-num cmp-model"><div class="cmp-bar" style="width:${barW}%"></div>
          <span class="cmp-model-v">${r.model != null ? fmtPct1(r.model) : '—'}</span></td>
      <td class="td-num" style="color:${SRC_COLORS.poly}">${r.poly != null ? fmtPct1(r.poly) : '—'}</td>
      <td class="td-num" style="color:${SRC_COLORS.kalshi}">${r.kalshi != null ? fmtPct1(r.kalshi) : '—'}</td>
      <td class="td-num" style="color:var(--text2)">${fmtPct1(cons)}</td>
      <td class="td-num">${r.model != null && cons != null ? edgeCell(r.model, cons) : '<span style="color:var(--text3)">—</span>'}</td>`;
    body.appendChild(tr);
  });
  const tbl = body.closest('table'); if (tbl) makeSortable(tbl);

  // Lollipop: model dot vs market dots, top 14 by consensus/model
  const top = rows.slice(0, 14).reverse();
  const names = top.map(r => r.name);
  const val = (v) => v != null ? +(v * 100).toFixed(2) : null;
  const consX = top.map(r => { const c = consensusOf({ poly: r.poly, kalshi: r.kalshi }); return c != null ? +(c * 100).toFixed(2) : null; });
  const modelX = top.map(r => val(r.model));
  const shapes = names.map((nm, i) => (consX[i] == null || modelX[i] == null) ? null : ({
    type: 'line', x0: modelX[i], x1: consX[i], y0: nm, y1: nm, line: { color: '#30363d', width: 2 }, layer: 'below',
  })).filter(Boolean);
  const trace = (name, xs, color, symbol, size) => ({
    type: 'scatter', mode: 'markers', name, y: names, x: xs,
    marker: { color, size, symbol, line: { color: '#0d1117', width: 1 } },
    hovertemplate: `<b>%{y}</b><br>${name}: %{x:.1f}%<extra></extra>`,
  });
  Plotly.newPlot('chart-boot', [
    trace('Model', modelX, SRC_COLORS.model, 'circle', 13),
    trace('Polymarket', top.map(r => val(r.poly)), SRC_COLORS.poly, 'diamond', 10),
    trace('Kalshi', top.map(r => val(r.kalshi)), SRC_COLORS.kalshi, 'square', 10),
  ], {
    ...DARK_LAYOUT, height: 500, shapes,
    margin: { t: 10, r: 16, b: 42, l: 130 },
    xaxis: { ...DARK_LAYOUT.xaxis, ticksuffix: '%', title: { text: 'Top-scorer probability', font: { size: 11 } }, rangemode: 'tozero' },
    yaxis: { ...DARK_LAYOUT.yaxis, automargin: true, tickfont: { size: 11 } },
    legend: { ...DARK_LAYOUT.legend, orientation: 'h', x: 0.5, xanchor: 'center', y: 1.05 },
    hovermode: 'closest',
  }, PLOTLY_CONF);
}

// Section 2: live scoring leaders (this tournament)
function renderLiveLeaders() {
  const rows = (DATA.playerLeaders && DATA.playerLeaders.live) || [];
  const body = document.getElementById('live-leaders-body');
  body.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${playerFlag(r.team)}<strong style="margin-left:6px">${r.name}</strong>
          <span style="font-size:0.7rem;color:var(--text3);margin-left:5px">${r.team}</span></td>
      <td class="td-num" style="font-weight:700;color:var(--blue)">${r.goals}</td>
      <td class="td-num">${r.assists}</td>
      <td class="td-num" style="color:var(--text3)">${r.penalties}</td>
      <td class="td-num" style="color:var(--text3)">${r.apps}</td>
      <td class="td-num" style="font-weight:600">${r.goals + r.assists}</td>`;
    body.appendChild(tr);
  });
  const tbl = body.closest('table'); if (tbl) makeSortable(tbl);
}

// Section 3: Historical Player Comparison — leaderboard (metric switch) + radar compare
const HP_METRICS = [
  { key: 'goals',          label: 'Goals' },
  { key: 'goals_90',       label: 'Goals / 90' },
  { key: 'xg',             label: 'xG' },
  { key: 'xg_90',          label: 'xG / 90' },
  { key: 'npxg_90',        label: 'Non-pen xG / 90' },
  { key: 'assists',        label: 'Assists' },
  { key: 'xa',             label: 'xA' },
  { key: 'xa_90',          label: 'xA / 90' },
  { key: 'key_passes',     label: 'Key passes' },
  { key: 'key_passes_90',  label: 'Key passes / 90' },
  { key: 'shots',          label: 'Shots' },
  { key: 'shots_90',       label: 'Shots / 90' },
  { key: 'prog_passes_90', label: 'Prog. passes / 90' },
  { key: 'pass_pct',       label: 'Pass %' },
  { key: 'gk_saves',       label: 'GK saves' },
];
// Radar axes (per-90, comparable across roles)
const RADAR_AXES = [
  { key: 'goals_90',       label: 'Goals' },
  { key: 'xg_90',          label: 'xG' },
  { key: 'assists_90',     label: 'Assists' },
  { key: 'xa_90',          label: 'xA' },
  { key: 'key_passes_90',  label: 'Key passes' },
  { key: 'shots_90',       label: 'Shots' },
  { key: 'prog_passes_90', label: 'Prog. passes' },
];

function initHistoricalCompare() {
  const players = (DATA.playersHist && DATA.playersHist.players) || [];

  // Metric switcher
  const msel = document.getElementById('hp-metric');
  msel.innerHTML = HP_METRICS.map(m => `<option value="${m.key}">${m.label}</option>`).join('');
  msel.addEventListener('change', () => renderHistLeaderboard(msel.value));
  renderHistLeaderboard('goals');

  // Player pickers (sorted by goals; label with team)
  const opts = players.map((p, i) => `<option value="${i}">${p.name} (${p.team})</option>`).join('');
  const a = document.getElementById('hp-a'), b = document.getElementById('hp-b');
  a.innerHTML = '<option value="">Player A…</option>' + opts;
  b.innerHTML = '<option value="">Player B…</option>' + opts;
  // Sensible defaults: top two goalscorers
  if (players.length >= 2) { a.value = '0'; b.value = '1'; }
  a.addEventListener('change', renderRadar);
  b.addEventListener('change', renderRadar);
  renderRadar();
}

function renderHistLeaderboard(metricKey) {
  const players = (DATA.playersHist && DATA.playersHist.players) || [];
  const meta = HP_METRICS.find(m => m.key === metricKey) || HP_METRICS[0];
  document.getElementById('hp-metric-col').textContent = meta.label;
  const per90 = metricKey.endsWith('_90') || metricKey === 'pass_pct';
  // For per-90 metrics require a minutes floor so tiny samples don't top the board
  const pool = per90 ? players.filter(p => p.minutes >= 270) : players;
  const ranked = [...pool].sort((x, y) => (y[metricKey] || 0) - (x[metricKey] || 0)).slice(0, 40);
  const body = document.getElementById('hp-leader-body');
  const fmt = v => per90 ? (+v).toFixed(2) : v;
  body.innerHTML = ranked.map((p, i) => `
    <tr>
      <td style="color:var(--text3)">${i + 1}</td>
      <td>${playerFlag(p.team)}<strong style="margin-left:6px">${p.name}</strong>
          <span style="font-size:0.68rem;color:var(--text3);margin-left:4px">${p.role}</span></td>
      <td class="td-num" style="font-weight:700;color:var(--blue)">${fmt(p[metricKey] ?? 0)}</td>
      <td class="td-num" style="color:var(--text3)">${p.minutes}</td>
    </tr>`).join('');
}

function renderRadar() {
  const players = (DATA.playersHist && DATA.playersHist.players) || [];
  const ai = document.getElementById('hp-a').value, bi = document.getElementById('hp-b').value;
  const picks = [ai, bi].filter(v => v !== '').map(v => players[+v]).filter(Boolean);

  // Normalize each axis to the 95th percentile across the pool (so one outlier
  // doesn't flatten the shape), clamped to 1.
  const p95 = {};
  RADAR_AXES.forEach(ax => {
    const vals = players.map(p => p[ax.key] || 0).filter(v => v > 0).sort((a, b) => a - b);
    p95[ax.key] = vals.length ? (vals[Math.floor(vals.length * 0.95)] || vals[vals.length - 1]) : 1;
  });
  const colors = ['#58a6ff', '#f778ba'];
  const fills = ['rgba(88,166,255,0.18)', 'rgba(247,120,186,0.18)'];
  const traces = picks.map((p, i) => ({
    type: 'scatterpolar', fill: 'toself', name: p.name,
    r: RADAR_AXES.map(ax => Math.min((p[ax.key] || 0) / (p95[ax.key] || 1), 1)).concat([Math.min((p[RADAR_AXES[0].key] || 0) / (p95[RADAR_AXES[0].key] || 1), 1)]),
    theta: RADAR_AXES.map(ax => ax.label).concat([RADAR_AXES[0].label]),
    line: { color: colors[i] }, fillcolor: fills[i],
    marker: { color: colors[i] },
    hovertemplate: '<b>' + p.name + '</b><br>%{theta}: %{r:.2f}<extra></extra>',
  }));

  Plotly.newPlot('chart-radar', traces, {
    ...DARK_LAYOUT, height: 340, margin: { t: 30, r: 30, b: 20, l: 30 },
    polar: {
      bgcolor: '#0d1117',
      radialaxis: { visible: true, range: [0, 1], showticklabels: false, gridcolor: '#30363d', linecolor: '#30363d' },
      angularaxis: { gridcolor: '#30363d', linecolor: '#30363d', tickfont: { size: 10, color: '#8b949e' } },
    },
    showlegend: true,
    legend: { ...DARK_LAYOUT.legend, orientation: 'h', x: 0.5, xanchor: 'center', y: 1.12 },
  }, PLOTLY_CONF);

  // Side-by-side value table
  const tbody = document.querySelector('#hp-compare-table tbody');
  if (picks.length === 2) {
    const [A, B] = picks;
    const rowsMeta = [
      { k: 'minutes', l: 'Minutes', d: 0 }, { k: 'goals', l: 'Goals', d: 0 },
      { k: 'xg', l: 'xG', d: 1 }, { k: 'assists', l: 'Assists', d: 0 },
      { k: 'xa', l: 'xA', d: 1 }, { k: 'key_passes', l: 'Key passes', d: 0 },
      { k: 'shots', l: 'Shots', d: 0 }, { k: 'goals_90', l: 'Goals / 90', d: 2 },
      { k: 'xg_90', l: 'xG / 90', d: 2 }, { k: 'pass_pct', l: 'Pass %', d: 1 },
    ];
    tbody.innerHTML = `<tr class="hp-cmp-head"><td>${A.name}</td><td class="td-mid"></td><td class="td-num2">${B.name}</td></tr>` +
      rowsMeta.map(m => {
        const av = A[m.k] ?? 0, bv = B[m.k] ?? 0;
        const aWin = av > bv, bWin = bv > av;
        return `<tr>
          <td class="td-num2 ${aWin ? 'hp-win' : ''}">${(+av).toFixed(m.d)}</td>
          <td class="td-mid">${m.l}</td>
          <td class="td-num2 ${bWin ? 'hp-win' : ''}">${(+bv).toFixed(m.d)}</td></tr>`;
      }).join('');
  } else {
    tbody.innerHTML = '<tr><td style="color:var(--text3);padding:12px;text-align:center">Pick two players to compare.</td></tr>';
  }
}

// ── Metadata ──────────────────────────────────────────────────────────────────
function updateMeta(meta) {
  const el = document.getElementById('last-updated');
  const d = new Date(meta.updated_at);
  const fmt = d.toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  el.textContent = `Updated ${fmt} UTC · ${meta.n_sims.toLocaleString()} sims`;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function init() {
  try {
    const [probs, groups, scenarios, meta, bracket, market, playerLeaders, playersHist] = await Promise.all([
      fetchJSON('probs.json'),
      fetchJSON('groups.json'),
      fetchJSON('scenarios.json'),
      fetchJSON('meta.json'),
      fetchJSON('bracket.json'),
      fetchJSON('market_odds.json').catch(() => ({ ok: false, winner: {}, reach: {} })),
      fetchJSON('player_leaders.json').catch(() => ({ golden_boot: [], live: [] })),
      fetchJSON('players.json').catch(() => ({ players: [] })),
    ]);
    DATA = { probs, groups, scenarios, meta, bracket, market, playerLeaders, playersHist };
    updateMarketStale(market);

    updateMeta(meta);
    document.getElementById('loading-overlay').style.display = 'none';

    document.querySelectorAll('#mainTabs .nav-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        activateTab(link.dataset.tab);
      });
    });

    // Deep-link support: open the tab named in the URL hash (e.g. #probs, #knockout).
    const validTabs = ['knockout', 'team', 'probs', 'players', 'groups', 'third', 'methodology'];
    const hashTab = (location.hash || '').replace('#', '');
    activateTab(validTabs.includes(hashTab) ? hashTab : 'knockout');
  } catch (err) {
    console.error(err);
    document.getElementById('loading-overlay').innerHTML =
      `<div style="color:#f85149;font-size:0.9rem">Error loading data: ${err.message}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
