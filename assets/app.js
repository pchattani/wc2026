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

  // showWin: true only when all R32 slots are confirmed (tournament bracket is fully set).
  // Confirmed slot + showWin → win %. Confirmed slot + no showWin → just name. Unconfirmed → slot %.
  function slotRow(teams) {
    const visible = teams.filter(t => t.p >= 0.03);
    if (!visible.length) return '<div class="bc-slot-row"><span class="bc-tbd-inline">TBD</span></div>';
    const confirmed = isConfirmedSlot(teams);
    const parts = visible.map(t => {
      let pct = '';
      if (allR32Confirmed && confirmed && t.p_win != null) {
        const fav = t.p_win >= 0.5;
        pct = `<span class="bc-inline-pct ${fav ? 'bc-ipct-fav' : 'bc-ipct-dog'}">(${(t.p_win * 100).toFixed(0)}%)</span>`;
      } else if (!confirmed) {
        pct = `<span class="bc-inline-pct bc-ipct-slot">(${(t.p * 100).toFixed(0)}%)</span>`;
      }
      const nc = confirmed ? 'bc-name bc-conf-name' : 'bc-name';
      return `<span class="bc-inline-team">${flagImg(t.team)}<span class="${nc}">${t.team}</span>${pct}</span>`;
    });
    return `<div class="bc-slot-row">${parts.join('<span class="bc-sep">/</span>')}</div>`;
  }

  function r32Card(gm) {
    const slotA = gm.slot_a_teams || [], slotB = gm.slot_b_teams || [];
    return `<div class="bc-game">
      <div class="bc-label">${gm.match_id} &middot; <span class="bc-slot-lbl">${gm.slot_a} vs ${gm.slot_b}</span></div>
      ${slotRow(slotA)}
      <div class="bc-slot-div"></div>
      ${slotRow(slotB)}
    </div>`;
  }

  function tbdCard(mid, a, b, cls) {
    return `<div class="bc-game${cls ? ' '+cls : ''}">
      <div class="bc-label">${mid}</div>
      <div class="bc-tbd-row">${a}</div>
      <div class="bc-tbd-row">${b}</div>
    </div>`;
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
  const r16Html = R16_GROUPS.map(([m1,m2], i) => {
    const [a1,b1] = R32_GROUPS[i*2], [a2,b2] = R32_GROUPS[i*2+1];
    return pr(
      tbdCard(`M${m1}`, `W ${r32[a1].match_id}`, `W ${r32[b1].match_id}`),
      tbdCard(`M${m2}`, `W ${r32[a2].match_id}`, `W ${r32[b2].match_id}`)
    );
  }).join('');

  // ── QF ─────────────────────────────────────────────────────────────────────
  const qfHtml = QF_GROUPS.map(([q1,q2], i) => pr(
    tbdCard(`M${q1}`, `W M${R16_GROUPS[i*2][0]}`, `W M${R16_GROUPS[i*2][1]}`, 'bc-game-qf'),
    tbdCard(`M${q2}`, `W M${R16_GROUPS[i*2+1][0]}`, `W M${R16_GROUPS[i*2+1][1]}`, 'bc-game-qf')
  )).join('');

  // ── SF ─────────────────────────────────────────────────────────────────────
  const sfHtml = pr(
    tbdCard('M101', `W M${QF_GROUPS[0][0]}`, `W M${QF_GROUPS[0][1]}`, 'bc-game-sf'),
    tbdCard('M102', `W M${QF_GROUPS[1][0]}`, `W M${QF_GROUPS[1][1]}`, 'bc-game-sf')
  );

  // ── Final ──────────────────────────────────────────────────────────────────
  const finHtml = tbdCard('M103 &middot; 19 Jul &middot; MetLife', 'W M101', 'W M102', 'bc-game-final');

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
