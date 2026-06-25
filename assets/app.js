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

// ── Data store ────────────────────────────────────────────────────────────────
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
  if (tabName === 'probs')    renderProbs();
  if (tabName === 'groups')   renderGroups();
  if (tabName === 'bracket')  renderBracket();
  if (tabName === 'third')    renderScenarios();
  if (tabName === 'timeline') renderTimeline();
  if (tabName === 'team')     initTeamView();
}

// ── Colours ───────────────────────────────────────────────────────────────────
const CONF_COLORS = {
  UEFA: '#58a6ff', CONMEBOL: '#3fb950', CONCACAF: '#f97316',
  CAF: '#d29922', AFC: '#bc8cff', OFC: '#8b949e', Other: '#6e7681',
};

// ── TAB 1: WIN PROBS ─────────────────────────────────────────────────────────
function renderProbs() {
  const { probs } = DATA;
  const teams = probs.teams;

  // Horizontal bar chart — all 48 teams
  const trace = {
    type: 'bar', orientation: 'h',
    y: teams.map(t => t.team),
    x: teams.map(t => t.p_win * 100),
    text: teams.map(t => (t.p_win * 100).toFixed(1) + '%'),
    textposition: 'outside',
    cliponaxis: false,
    marker: { color: teams.map(t => CONF_COLORS[t.confederation] || '#6e7681') },
    hovertemplate: '<b>%{y}</b><br>Win: %{x:.1f}%<extra></extra>',
  };

  const layout = {
    ...DARK_LAYOUT,
    margin: { t: 10, r: 60, b: 30, l: 130 },
    xaxis: { ...DARK_LAYOUT.xaxis, ticksuffix: '%', title: '' },
    yaxis: { ...DARK_LAYOUT.yaxis, automargin: true, tickfont: { size: 11 } },
    height: 700,
    shapes: [{ type: 'line', x0: 0, x1: 0, y0: -0.5, y1: 47.5, line: { color: '#30363d', width: 1 } }],
  };

  // Legend via annotations
  const confNames = [...new Set(teams.map(t => t.confederation))];
  const legendAnnotations = confNames.map((c, i) => ({
    x: 1.01, xref: 'paper', y: 1 - i * 0.05, yref: 'paper',
    text: `<span style="color:${CONF_COLORS[c]}">■</span> ${c}`,
    showarrow: false, font: { size: 10, color: '#8b949e' }, xanchor: 'left',
  }));
  layout.annotations = legendAnnotations;

  Plotly.newPlot('chart-probs', [trace], layout, PLOTLY_CONF);

  // Stage probability table — top 16
  const tbody = document.getElementById('probs-table-body');
  tbody.innerHTML = '';
  teams.slice(0, 16).forEach((t, idx) => {
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

    // Standings table
    html += `<table class="wc-table">
      <thead><tr>
        <th style="width:16px"></th><th></th>
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

    // Fixtures
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
  });
}

// ── TAB 3: BRACKET ───────────────────────────────────────────────────────────
function renderBracket() {
  const { bracket, probs } = DATA;

  // Build a lookup: team → p_r32
  const teamR32 = {};
  probs.teams.forEach(t => { teamR32[t.team] = t.p_r32; });

  // Build most-likely team for each slot from team paths
  const teamPaths = bracket.team_paths || {};

  // R32 matches
  const r32Container = document.getElementById('bracket-r32');
  r32Container.innerHTML = '';

  bracket.r32.forEach(m => {
    const div = document.createElement('div');
    div.className = 'bracket-match';

    // Find top 2 teams for each slot
    const topTeamsA = [];
    const topTeamsB = [];

    // Slot A teams and slot B teams from matchup probabilities
    // We'll use team paths: for each team, check if they appear in R32 matchups
    const slotTeams = {};
    Object.entries(teamPaths).forEach(([team, path]) => {
      const r32opps = path.r32 || {};
      Object.entries(r32opps).forEach(([opp, p]) => {
        // This team plays this opponent in R32
        const key = [team, opp].sort().join('|||');
        if (!slotTeams[key]) slotTeams[key] = { team, opp, p };
      });
    });

    // For this match's slot, find the top probable teams
    // Use the slot label as fallback
    const slotA = m.slot_a;
    const slotB = m.slot_b;

    // Display top 3 likely teams from simulation for each side
    // We approximate by looking at which teams have high R32 probability
    // and match the slot description
    const isSlot3rd = s => s.includes('3rd:');

    div.innerHTML = `
      <div class="bracket-match-id">${m.match_id} · R32</div>
      <div class="bracket-team">
        <span class="bracket-team-name ${slotA.length <= 3 ? 'bracket-confirmed' : ''}">${formatSlot(slotA)}</span>
        <span class="bracket-team-pct" style="font-size:0.7rem;color:var(--text3)">${slotA}</span>
      </div>
      <div class="bracket-team">
        <span class="bracket-team-name">${formatSlot(slotB)}</span>
        <span class="bracket-team-pct" style="font-size:0.7rem;color:var(--text3)">${slotB}</span>
      </div>
    `;
    r32Container.appendChild(div);
  });

  // R16 — show most likely matchups from team paths
  const r16Container = document.getElementById('bracket-r16');
  r16Container.innerHTML = '';

  // Collect all R16 opponent probabilities
  const r16pairs = {};
  Object.entries(teamPaths).forEach(([team, path]) => {
    const opps = path.r16 || {};
    const topOpp = Object.entries(opps).sort((a, b) => b[1] - a[1])[0];
    if (topOpp) {
      const key = [team, topOpp[0]].sort().join('|||');
      if (!r16pairs[key]) {
        r16pairs[key] = { team, opp: topOpp[0], p: topOpp[1] };
      }
    }
  });

  // Deduplicate and show top 8 matchups
  const r16shown = new Set();
  Object.values(r16pairs)
    .sort((a, b) => b.p - a.p)
    .slice(0, 16)
    .forEach(({ team, opp, p }) => {
      const key = [team, opp].sort().join('|||');
      if (r16shown.has(key)) return;
      r16shown.add(key);
      const probA = teamPaths[team]?.r16?.[opp] || 0;
      const probB = teamPaths[opp]?.r16?.[team] || 0;
      const div = document.createElement('div');
      div.className = 'bracket-match';
      div.innerHTML = `
        <div class="bracket-match-id">R16 matchup</div>
        <div class="bracket-team">
          <span class="bracket-team-name">${team}</span>
          <span class="bracket-team-pct">${(probA * 100).toFixed(1)}%</span>
        </div>
        <div class="bracket-team">
          <span class="bracket-team-name">${opp}</span>
          <span class="bracket-team-pct">${(probB * 100).toFixed(1)}%</span>
        </div>
      `;
      r16Container.appendChild(div);
    });
}

function formatSlot(slot) {
  if (slot.startsWith('1') || slot.startsWith('2')) {
    const pos = slot[0] === '1' ? '1st' : '2nd';
    return `Group ${slot[1]} — ${pos}`;
  }
  if (slot.startsWith('3rd:')) {
    return '3rd-place from Grp ' + slot.slice(4);
  }
  return slot;
}

// ── TAB 4: 3RD PLACE SCENARIOS ───────────────────────────────────────────────
function renderScenarios() {
  const { scenarios } = DATA;
  const rows = scenarios.scenarios;

  // Update note
  const note = document.getElementById('scenario-note');
  const high = rows.find(r => r.pts === 3 && r.p_qualify < 0.999 && r.p_qualify >= 0.90);
  const mid  = rows.find(r => r.pts === 3 && r.p_qualify >= 0.50 && r.p_qualify < 0.80);
  note.innerHTML = `
    <strong style="color:var(--blue)">How to read this:</strong>
    Each cell shows the probability that a 3rd-place team with that
    <em>points total</em> and <em>goal difference</em> would qualify as one of the best 8 of 12 third-place teams.
    <br>
    <strong style="color:var(--green)">4 points → guaranteed qualification</strong> in nearly all scenarios.
    <strong style="color:var(--yellow)">3 points → depends heavily on goal difference</strong>
    (3 pts, GD ≥ 0 is ~99%; at GD −4 drops to ~84%).
    <strong style="color:var(--red)">2 or fewer points → very unlikely.</strong>
  `;

  // Heatmap: rows = pts (high to low), cols = GD values
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
    text: z.map(row => row.map(v => v !== null ? (v * 100).toFixed(0) + '%' : 'n/a')),
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

  // Table
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
}

// ── TAB 5: TIMELINE ──────────────────────────────────────────────────────────
function renderTimeline() {
  const { history, probs } = DATA;
  const snapshots = history.snapshots;
  if (!snapshots || snapshots.length < 2) {
    document.getElementById('chart-timeline').innerHTML =
      '<div style="color:var(--text2);padding:40px;text-align:center">Timeline will appear after multiple simulation runs.</div>';
    return;
  }

  // Top 10 teams by current win probability
  const top10 = probs.teams.slice(0, 10).map(t => t.team);

  const traces = top10.map(team => {
    const x = [], y = [];
    snapshots.forEach(snap => {
      if (snap.probs[team] !== undefined) {
        x.push(snap.label || snap.ts);
        y.push(snap.probs[team] * 100);
      }
    });
    return {
      type: 'scatter', mode: 'lines+markers',
      name: team, x, y,
      line: { width: 2 },
      marker: { size: 5 },
      hovertemplate: `<b>${team}</b><br>%{y:.1f}%<extra></extra>`,
    };
  });

  const layout = {
    ...DARK_LAYOUT,
    margin: { t: 10, r: 20, b: 60, l: 50 },
    yaxis: { ...DARK_LAYOUT.yaxis, title: 'Win Probability (%)', ticksuffix: '%' },
    xaxis: { ...DARK_LAYOUT.xaxis, title: '' },
    legend: { ...DARK_LAYOUT.legend, orientation: 'h', y: -0.2, x: 0 },
  };

  Plotly.newPlot('chart-timeline', traces, layout, PLOTLY_CONF);
}

// ── TAB 6: TEAM VIEW ─────────────────────────────────────────────────────────
function initTeamView() {
  const { probs, bracket } = DATA;
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

  let html = `
    <div class="row g-3">
      <div class="col-md-5">
        <div class="card">
          <div class="card-header">Stage Probabilities — ${team}</div>
          <div class="card-body">
  `;

  stages.forEach(s => {
    const pct = teamData[s.key] * 100;
    html += `
      <div class="prob-bar-wrap">
        <div class="prob-bar-label">${s.label}</div>
        <div class="prob-bar-track">
          <div class="prob-bar-fill" style="width:${Math.min(pct, 100)}%"></div>
        </div>
        <div class="prob-bar-pct">${pct.toFixed(1)}%</div>
      </div>
    `;
  });

  html += `</div></div></div>`;

  // Most likely opponents
  const paths = (bracket.team_paths || {})[team] || {};
  const stageNames = { r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF', final: 'Final' };
  html += `<div class="col-md-7"><div class="card"><div class="card-header">Most Likely Opponents — ${team}</div>
    <div class="card-body" style="padding:0">
    <table class="wc-table"><thead><tr><th>Stage</th><th>Most Likely Opponent</th><th class="td-num">P(face)</th></tr></thead><tbody>`;

  ['r32', 'r16', 'qf', 'sf', 'final'].forEach(stage => {
    const opps = Object.entries(paths[stage] || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (!opps.length) return;
    opps.forEach(([opp, p], i) => {
      html += `<tr>
        <td>${i === 0 ? stageNames[stage] : ''}</td>
        <td>${opp}</td>
        <td class="td-num" style="color:var(--text2)">${(p * 100).toFixed(1)}%</td>
      </tr>`;
    });
  });

  html += `</tbody></table></div></div></div></div>`;
  content.innerHTML = html;
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
    const [probs, groups, bracket, scenarios, history, meta] = await Promise.all([
      fetchJSON('probs.json'),
      fetchJSON('groups.json'),
      fetchJSON('bracket.json'),
      fetchJSON('scenarios.json'),
      fetchJSON('history.json'),
      fetchJSON('meta.json'),
    ]);
    DATA = { probs, groups, bracket, scenarios, history, meta };

    updateMeta(meta);
    document.getElementById('loading-overlay').style.display = 'none';

    // Tab click listeners
    document.querySelectorAll('#mainTabs .nav-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        activateTab(link.dataset.tab);
      });
    });

    // Render first tab
    renderTab('probs');
  } catch (err) {
    console.error(err);
    document.getElementById('loading-overlay').innerHTML =
      `<div style="color:#f85149;font-size:0.9rem">Error loading data: ${err.message}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', init);
