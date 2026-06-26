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
  // methodology tab is static HTML — no render function needed
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

// ── TAB 1: WIN PROBS ─────────────────────────────────────────────────────────
function renderProbs() {
  const { probs } = DATA;
  const teams = probs.teams;

  // Vertical bar chart — top 20 teams
  const top20 = teams.slice(0, 20);
  const trace = {
    type: 'bar',
    x: top20.map(t => t.team),
    y: top20.map(t => +(t.p_win * 100).toFixed(2)),
    text: top20.map(t => (t.p_win * 100).toFixed(1) + '%'),
    textposition: 'outside',
    cliponaxis: false,
    marker: {
      color: top20.map(t => CONF_COLORS[t.confederation] || '#6e7681'),
      line: { width: 0 },
    },
    hovertemplate: '<b>%{x}</b><br>Win: %{y:.1f}%<extra></extra>',
  };

  const layout = {
    ...DARK_LAYOUT,
    margin: { t: 30, r: 20, b: 90, l: 50 },
    xaxis: {
      ...DARK_LAYOUT.xaxis,
      tickangle: -40,
      tickfont: { size: 11 },
      automargin: true,
    },
    yaxis: {
      ...DARK_LAYOUT.yaxis,
      ticksuffix: '%',
      title: { text: 'Win Probability', font: { size: 11 } },
    },
    height: 380,
    bargap: 0.3,
  };

  // Confederation legend as annotations
  const confSeen = [...new Set(top20.map(t => t.confederation))];
  layout.annotations = confSeen.map((c, i) => ({
    x: 1, xref: 'paper', y: 1 - i * 0.07, yref: 'paper',
    text: `<span style="color:${CONF_COLORS[c]}">■</span> ${c}`,
    showarrow: false, font: { size: 10, color: '#8b949e' }, xanchor: 'left',
  }));

  Plotly.newPlot('chart-probs', [trace], layout, PLOTLY_CONF);

  // Stage probability table — all 48 teams, sortable
  const tbody = document.getElementById('probs-table-body');
  tbody.innerHTML = '';
  teams.forEach((t, idx) => {
    const tr = document.createElement('tr');
    const pct = v => (v * 100).toFixed(1) + '%';
    tr.innerHTML = `
      <td><span style="color:${CONF_COLORS[t.confederation]};margin-right:6px">■</span>
          <strong>${t.team}</strong>
          <span style="font-size:0.7rem;color:var(--text3);margin-left:4px">#${t.fifa_rank}</span></td>
      <td class="td-num">${pct(t.p_r32)}</td>
      <td class="td-num">${pct(t.p_r16)}</td>
      <td class="td-num">${pct(t.p_qf)}</td>
      <td class="td-num">${pct(t.p_sf)}</td>
      <td class="td-num">${pct(t.p_final)}</td>
      <td class="td-num" style="color:var(--blue);font-weight:600">${pct(t.p_win)}</td>
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
  const { bracket } = DATA;
  const r32 = bracket.r32;
  const container = document.getElementById('bracket-tree');
  container.innerHTML = '';

  // ── helpers ────────────────────────────────────────────────────────────────

  function flagImg(teamName) {
    const code = TEAM_FLAG[teamName];
    if (!code) return '<span style="width:20px;height:15px;display:inline-block;flex-shrink:0"></span>';
    return `<img class="bc-flag" src="https://flagcdn.com/20x15/${code}.png" alt="" loading="lazy" onerror="this.style.display='none'">`;
  }

  // A team row: flag + name + probability chip
  // winProb: h2h conditional win probability (undefined = not available)
  // slotP: probability of occupying this slot (undefined if confirmed)
  function teamRow(teamName, isConfirmed, winProb, slotP) {
    let probHtml = '';
    if (winProb !== undefined) {
      const cls = winProb >= 0.5 ? 'bc-pct-fav' : 'bc-pct-dog';
      probHtml = `<span class="bc-win-pct ${cls}">${(winProb * 100).toFixed(0)}%</span>`;
    } else if (slotP !== undefined && slotP < 0.96) {
      probHtml = `<span class="bc-win-pct bc-pct-slot">${(slotP * 100).toFixed(0)}%</span>`;
    }
    const confirmedCls = isConfirmed ? ' bc-confirmed' : '';
    return `<div class="bc-team-row${confirmedCls}">
      ${flagImg(teamName)}
      <span class="bc-name">${teamName}</span>
      ${probHtml}
    </div>`;
  }

  // R32 match card: up to 2 teams per slot, h2h win prob when both confirmed (p >= 0.85)
  function r32Card(gm) {
    const slotA = gm.slot_a_teams || [];
    const slotB = gm.slot_b_teams || [];
    const h2h   = gm.h2h;

    const topA  = slotA[0];
    const altA  = slotA.length > 1 && slotA[1].p >= 0.04 ? slotA[1] : null;
    const topB  = slotB[0];
    const altB  = slotB.length > 1 && slotB[1].p >= 0.04 ? slotB[1] : null;

    // Only show h2h win probability when both primary teams are near-certain (p >= 0.85)
    const confA  = topA && topA.p >= 0.85;
    const confB  = topB && topB.p >= 0.85;
    const useH2H = h2h && confA && confB;

    // Build one slot's HTML (primary team + optional secondary)
    function slotHtml(primary, secondary, isConf, winProb) {
      if (!primary) return '<div class="bc-tbd-row">—</div>';

      let pHtml = '';
      if (useH2H && winProb !== undefined) {
        const fav = winProb >= 0.5;
        pHtml = `<span class="bc-win-pct ${fav ? 'bc-pct-fav' : 'bc-pct-dog'}">${(winProb * 100).toFixed(0)}%</span>`;
      } else if (!isConf) {
        pHtml = `<span class="bc-win-pct bc-pct-slot">${(primary.p * 100).toFixed(0)}%</span>`;
      }

      const rows = `<div class="bc-team-row${isConf ? ' bc-confirmed' : ''}">
        ${flagImg(primary.team)}<span class="bc-name">${primary.team}</span>${pHtml}
      </div>`;

      const altRow = (!useH2H && secondary)
        ? `<div class="bc-team-row bc-team-alt">
            ${flagImg(secondary.team)}<span class="bc-name">${secondary.team}</span>
            <span class="bc-win-pct bc-pct-dim">${(secondary.p * 100).toFixed(0)}%</span>
          </div>`
        : '';
      return rows + altRow;
    }

    const pA = useH2H ? h2h.p_a_wins       : undefined;
    const pB = useH2H ? 1 - h2h.p_a_wins   : undefined;

    return `<div class="bc-game">
      <div class="bc-label">${gm.match_id} &middot; <span class="bc-slot-lbl">${gm.slot_a} vs ${gm.slot_b}</span></div>
      ${slotHtml(topA, altA, confA, pA)}
      <div class="bc-slot-div"></div>
      ${slotHtml(topB, altB, confB, pB)}
    </div>`;
  }

  // TBD card for R16/QF/SF -- no teams yet, just show which R32 winners feed in
  function tbdCard(matchId, labelA, labelB, extraCls) {
    extraCls = extraCls || '';
    return `<div class="bc-game ${extraCls}">
      <div class="bc-label">${matchId}</div>
      <div class="bc-tbd-row">${labelA}</div>
      <div class="bc-tbd-row">${labelB}</div>
    </div>`;
  }

  // n connector pairs; spacer at top matches bc-round-label height so lines align with match cards
  function connectors(n) {
    const el = document.createElement('div');
    el.className = 'bc-connectors';
    let html = '<div class="bc-conn-spacer"></div>';
    for (let i = 0; i < n; i++) {
      html += '<div class="bc-conn-pair"><div class="bc-conn-top"></div><div class="bc-conn-bot"></div></div>';
    }
    el.innerHTML = html;
    return el;
  }

  function roundLabelEl(text) {
    const el = document.createElement('div');
    el.className = 'bc-round-label';
    el.textContent = text;
    return el;
  }

  // ── build one bracket half ─────────────────────────────────────────────────
  function buildHalf(halfDef, isRight) {
    const wrap = document.createElement('div');
    wrap.className = 'bracket-half' + (isRight ? ' bracket-half-right' : ' bracket-half-left');

    const r32Games = halfDef.r32_order.map(i => r32[i]);

    // R32 column
    const r32Col = document.createElement('div');
    r32Col.className = 'bc-col bc-col-r32';
    r32Col.appendChild(roundLabelEl('Round of 32'));
    for (let i = 0; i < 4; i++) {
      const pair = document.createElement('div');
      pair.className = 'bc-pair';
      pair.innerHTML = r32Card(r32Games[i * 2]) + r32Card(r32Games[i * 2 + 1]);
      r32Col.appendChild(pair);
    }

    // R16 column
    const r16Col = document.createElement('div');
    r16Col.className = 'bc-col bc-col-r16';
    r16Col.appendChild(roundLabelEl('Round of 16'));
    for (let i = 0; i < 2; i++) {
      const pair = document.createElement('div');
      pair.className = 'bc-pair';
      for (let j = 0; j < 2; j++) {
        const r16idx   = halfDef.r16_order[i * 2 + j];
        const [rA, rB] = R16_PAIRS[r16idx];
        pair.innerHTML += tbdCard(`M${89 + r16idx}`,
          `W ${r32[rA].match_id}`, `W ${r32[rB].match_id}`);
      }
      r16Col.appendChild(pair);
    }

    // QF column
    const qfCol = document.createElement('div');
    qfCol.className = 'bc-col bc-col-qf';
    qfCol.appendChild(roundLabelEl('Quarter-Final'));
    halfDef.qf_order.forEach(qfIdx => {
      const [r16a, r16b] = QF_PAIRS[qfIdx];
      qfCol.innerHTML += tbdCard(`M${97 + qfIdx}`,
        `W M${89 + r16a}`, `W M${89 + r16b}`, 'bc-game-qf');
    });

    // SF column
    const sfCol = document.createElement('div');
    sfCol.className = 'bc-col bc-col-sf';
    sfCol.appendChild(roundLabelEl('Semi-Final'));
    const [qfa, qfb] = [halfDef.qf_order[0], halfDef.qf_order[1]];
    sfCol.innerHTML += tbdCard(`M${101 + halfDef.sf_idx}`,
      `W M${97 + qfa}`, `W M${97 + qfb}`, 'bc-game-sf');

    const colOrder = isRight
      ? [sfCol, connectors(1), qfCol, connectors(2), r16Col, connectors(4), r32Col]
      : [r32Col, connectors(4), r16Col, connectors(2), qfCol, connectors(1), sfCol];

    colOrder.forEach(c => wrap.appendChild(c));
    return wrap;
  }

  // ── assemble ───────────────────────────────────────────────────────────────
  const leftHalf  = buildHalf(BRACKET_HALVES[0], false);
  const rightHalf = buildHalf(BRACKET_HALVES[1], true);

  const finalWrap = document.createElement('div');
  finalWrap.className = 'bc-final-wrap';
  finalWrap.innerHTML = `
    <div class="bc-final-label">&#127942; FINAL</div>
    <div class="bc-game bc-game-final">
      <div class="bc-label">M103 &middot; 19 Jul &middot; MetLife</div>
      <div class="bc-tbd-row">W M101</div>
      <div class="bc-tbd-row">W M102</div>
    </div>
  `;

  container.appendChild(leftHalf);
  container.appendChild(finalWrap);
  container.appendChild(rightHalf);
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

  // ── Path-by-position section ─────────────────────────────────────────────
  const teamPaths = bracket && bracket.team_paths && bracket.team_paths[team];
  let html = '';
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
    const [probs, groups, scenarios, meta, bracket] = await Promise.all([
      fetchJSON('probs.json'),
      fetchJSON('groups.json'),
      fetchJSON('scenarios.json'),
      fetchJSON('meta.json'),
      fetchJSON('bracket.json'),
    ]);
    DATA = { probs, groups, scenarios, meta, bracket };

    updateMeta(meta);
    document.getElementById('loading-overlay').style.display = 'none';

    document.querySelectorAll('#mainTabs .nav-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        activateTab(link.dataset.tab);
      });
    });

    renderTab('groups');
  } catch (err) {
    console.error(err);
    document.getElementById('loading-overlay').innerHTML =
      `<div style="color:#f85149;font-size:0.9rem">Error loading data: ${err.message}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
