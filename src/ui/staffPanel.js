// Staff roster overlay: per-person hiring, training and firing.
// Money/state changes are injected by main.js; this module only renders and
// routes button intent.
export function createStaffPanel({
  document,
  staffConfig,
  staffOrder,
  getStaff,
  getState,
  getRoster = () => ({}),
  getPortrait = () => null,
  getApplicants = () => [],
  getBoardRefreshSeconds = () => 0,
  costs,        // { hire, train, reroll, canHire, canTrain }
  describe = () => '',   // (role, entry) -> live status line
  traits = {},
  onHire,
  onTrain,
  onFire = () => false,
  onReroll = () => 0,
  onSpendFeedback = () => {},
  wageScale = () => 1,   // era wage multiplier — displayed pay matches the live drain
  fmt,
}) {
  const $ = id => document.getElementById(id);
  const panel = $('staffPanel');
  const list = $('staffList');
  let open = false;
  let lastRenderKey = '';
  let feedback = null;
  let suppressClickUntil = 0;
  let deferredRenderDepth = 0;
  let renderQueued = false;
  let eraWage = 1;   // refreshed each render from wageScale()

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const hex = value => `#${(Number(value) >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
  const pct = value => `${Math.round((value || 0) * 100)}%`;

  function titleCase(value) {
    return String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase());
  }

  function mmss(seconds) {
    const s = Math.max(0, Math.ceil(seconds || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function avatar(person, extra = '') {
    const look = person.look || {};
    const style = `--skin:${hex(look.skin)};--hair:${hex(look.hair)};--uniform:${hex(look.uniform)}`;
    // Preferred: the person's actual 3D figure baked to a bust image, so the
    // roster and the walking world actor are the same character.
    const portrait = getPortrait(person);
    if (portrait) {
      return `<div class="person-avatar rendered ${extra}" style="${style}">` +
        `<img class="pa-render" src="${portrait}" alt="" draggable="false"></div>`;
    }
    // Fallback: CSS-drawn face (no WebGL / render failed).
    const cls = `person-avatar ${extra} hair-${esc(look.hairStyle || 'short')} acc-${esc(look.accessory || 'none')}`;
    return `<div class="${cls}" style="${style}">` +
      `<span class="pa-body"></span><span class="pa-head"></span><span class="pa-hair"></span>` +
      `<span class="pa-face"></span><span class="pa-acc"></span>` +
      `</div>`;
  }

  function traitChips(person) {
    return (person.traits || []).map(id => {
      const t = traits[id] || { name: titleCase(id), desc: '' };
      return `<span class="trait-chip" title="${esc(t.desc)}">${esc(t.name)}</span>`;
    }).join('');
  }

  function skillBars(person) {
    return (person.axisNames || []).map(name =>
      `<div class="skill-row"><span>${esc(name)}</span><b>${pct(person.axes?.[name] || 0)}</b>` +
      `<i><em style="width:${pct(person.axes?.[name] || 0)}"></em></i></div>`
    ).join('');
  }

  function rarityLabel(person) {
    return `<span class="person-rarity ${esc(person.rarity || 'common')}">${esc(titleCase(person.rarity || 'common'))}</span>`;
  }

  function roleLead(role, people) {
    if (!people.length) return null;
    const lead = people.reduce((best, person) => {
      const score = (person.coverage || 0) * 10 + (person.level || 0);
      const bestScore = (best.coverage || 0) * 10 + (best.level || 0);
      return score > bestScore ? person : best;
    }, people[0]);
    const departmentHead = role === 'scientists' || role === 'marketers';
    return { ...lead, label: departmentHead ? 'Department Head' : 'Crew Lead' };
  }

  function renderApplicant(role, person, index, money, atCap = false) {
    const fee = costs.hirePerson ? costs.hirePerson(role, index, person) : costs.hire(role);
    const veteran = (person.traits || []).includes('veteran');
    return `<div class="applicant-card">` +
      avatar(person) +
      `<div class="person-main">` +
      `<div class="person-name">${esc(person.name)} ${rarityLabel(person)}</div>` +
      `<div class="person-meta">Potential ${person.potential} · Wage $${fmt(person.baseSalary * eraWage)}/min${veteran ? ' · Veteran Lv 2' : ''}</div>` +
      `<div class="person-skills">${skillBars(person)}</div>` +
      `<div class="trait-list">${traitChips(person)}</div>` +
      `</div>` +
      `<button class="staff-btn" data-act="hire-person" data-role="${role}" data-index="${index}" ${atCap || money < fee ? 'disabled' : ''}>${atCap ? 'Roster Full' : `Hire $${fmt(fee)}`}</button>` +
      `</div>`;
  }

  function renderMember(role, person, index, money) {
    const trainCost = costs.trainPerson ? costs.trainPerson(role, index, person) : costs.train(role);
    const canTrain = !person.atPotential;
    return `<div class="member-card">` +
      avatar(person) +
      `<div class="person-main">` +
      `<div class="person-name">${esc(person.name)} ${rarityLabel(person)}</div>` +
      `<div class="person-meta">Level ${person.level}/${person.potential} · Skill ${pct(person.coverage || person.competence)} · Wage $${fmt(person.salaryPerMin * eraWage)}/min</div>` +
      `<div class="person-skills">${skillBars(person)}</div>` +
      `<div class="trait-list">${traitChips(person)}</div>` +
      `</div>` +
      `<div class="person-actions">` +
      `<button class="staff-btn train" data-act="train-person" data-role="${role}" data-index="${index}" ${!canTrain || money < trainCost ? 'disabled' : ''}>${canTrain ? `Train $${fmt(trainCost)}` : 'Max'}</button>` +
      `<button class="staff-btn fire" data-act="fire-person" data-role="${role}" data-index="${index}">Fire</button>` +
      `</div>` +
      `</div>`;
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : cb => setTimeout(cb, 0);
    raf(() => {
      renderQueued = false;
      renderNow();
    });
  }

  function render() {
    if (deferredRenderDepth > 0) {
      queueRender();
      return;
    }
    renderNow();
  }

  function renderNow() {
    if (!list) return;
    const staff = getStaff();
    const roster = getRoster();
    const money = getState().money;
    eraWage = Math.max(1, wageScale() || 1);
    const renderKey = JSON.stringify({
      money: Math.floor(money),
      eraWage: Math.round(eraWage * 10),
      staff: staffOrder.map(role => {
        const entry = staff[role] || {};
        const applicants = getApplicants(role);
        const members = roster[role] || [];
        return [
          role,
          entry.hired,
          Math.round((entry.trained || 0) * 100),
          Math.floor(entry.salaryPerMin || 0),
          members.map(m => `${m.seed}:${m.level}`).join('|'),
          applicants.map(p => p.seed).join('|'),
          Math.ceil(getBoardRefreshSeconds(role) / 5),
        ];
      }),
      feedback: feedback && performance.now() - feedback.time < 850 ? feedback.text : null,
    });
    if (renderKey === lastRenderKey) return;
    lastRenderKey = renderKey;
    list.innerHTML = '';
    staffOrder.forEach(role => {
      const cfg = staffConfig[role];
      const s = staff[role] || { hired: 0, trained: 0, people: [], salaryPerMin: 0 };
      const people = s.people || [];
      const applicants = getApplicants(role);
      const hireable = costs.canHire(role, staff);
      const atCap = costs.atCap ? costs.atCap(role) : false;
      const cap = costs.cap ? costs.cap(role) : Infinity;
      const trainable = costs.canTrain(role, staff);
      const hCost = costs.hire(role, staff);
      const tCost = costs.train(role, staff);
      const rCost = costs.reroll ? costs.reroll(role, staff) : 0;
      const lead = roleLead(role, people);
      const isFeedback = feedback?.role === role && performance.now() - feedback.time < 850;

      const row = document.createElement('div');
      row.className = `staff-row staff-dept${isFeedback ? ' staff-flash' : ''}`;
      row.innerHTML =
        `<div class="dept-top">` +
        `<div class="s-ic">${cfg.icon}</div>` +
        `<div class="dept-copy">` +
        `<div class="s-nm">${cfg.name} <span class="s-count">x${s.hired}</span>` +
        `<span class="s-tr"> · Training Lv ${(s.trained || 0).toFixed(1)}</span></div>` +
        `<div class="s-ds">${cfg.desc}</div>` +
        `<div class="s-status">${esc(describe(role, s))}</div>` +
        `</div>` +
        `<div class="s-acts">` +
        `<button class="staff-btn" data-act="hire" data-role="${role}" ${!hireable || money < hCost ? 'disabled' : ''}>${hireable ? `Hire $${fmt(hCost)}` : (atCap ? 'Roster Full' : 'No applicants')}</button>` +
        `<button class="staff-btn train" data-act="train" data-role="${role}" ${!trainable || money < tCost ? 'disabled' : ''}>${trainable ? `Train $${fmt(tCost)}` : 'Train Max'}</button>` +
        `</div>` +
        `${isFeedback ? `<div class="s-feedback">${esc(feedback.text)}</div>` : ''}` +
        `</div>` +
        `<div class="lead-strip ${lead ? '' : 'empty'}">` +
        (lead
          ? `${avatar(lead, 'small')}<div><b>${esc(lead.label)}</b><span>${esc(lead.name)} · Lv ${lead.level}/${lead.potential} · $${fmt(lead.salaryPerMin * eraWage)}/min</span></div>`
          : `<div><b>No crew yet</b><span>Choose from the job board below.</span></div>`) +
        `</div>` +
        `<div class="board-head"><b>Job Board</b><span>Refresh ${mmss(getBoardRefreshSeconds(role))}</span><button class="staff-btn reroll" data-act="reroll" data-role="${role}" ${money < rCost ? 'disabled' : ''}>Reroll $${fmt(rCost)}</button></div>` +
        `<div class="applicant-grid">${applicants.map((p, i) => renderApplicant(role, p, i, money, atCap)).join('') || '<div class="empty-note">No applicants. Reroll the board.</div>'}</div>` +
        `<div class="roster-head"><b>Roster ${people.length}/${cap === Infinity ? '∞' : cap}</b><span>Payroll $${fmt((s.salaryPerMin || 0) * eraWage)}/min${eraWage > 1.05 ? ` · era wages ×${eraWage.toFixed(1)}` : ''}</span></div>` +
        `<div class="member-grid">${people.map((p, i) => renderMember(role, p, i, money)).join('') || '<div class="empty-note">Nobody hired yet.</div>'}</div>`;
      list.appendChild(row);
    });
  }

  function feedbackText(act, spent) {
    if (act === 'fire-person') return 'Fired';
    if (act === 'reroll') return `Rerolled -$${fmt(spent)}`;
    if (act === 'train' || act === 'train-person') return `Trained -$${fmt(spent)}`;
    return `Hired -$${fmt(spent)}`;
  }

  function activateButton(btn, point = null, deferRender = false) {
    if (!btn || btn.disabled) return;
    const { act, role } = btn.dataset;
    const index = Number(btn.dataset.index);
    let spent = 0;
    let changed = false;
    if (deferRender) deferredRenderDepth += 1;
    try {
      if (act === 'hire') { spent = onHire(role); changed = spent > 0; }
      else if (act === 'train') { spent = onTrain(role); changed = spent > 0; }
      else if (act === 'hire-person') { spent = onHire(role, index); changed = spent > 0; }
      else if (act === 'train-person') { spent = onTrain(role, index); changed = spent > 0; }
      else if (act === 'reroll') { spent = onReroll(role); changed = spent > 0; }
      else if (act === 'fire-person') { changed = onFire(role, index); }
    } finally {
      if (deferRender) deferredRenderDepth -= 1;
    }

    if (changed) {
      const rect = btn.getBoundingClientRect();
      const x = point?.x ?? rect.left + rect.width / 2;
      const y = point?.y ?? rect.top + rect.height / 2;
      feedback = { role, time: performance.now(), text: feedbackText(act, spent) };
      if (spent > 0) onSpendFeedback(spent, x, y, { act, role, index });
      lastRenderKey = '';
    }
    if (deferRender && changed) queueRender();
    else render();
  }

  if (list) {
    list.addEventListener('pointerdown', e => {
      const btn = e.target.closest('.staff-btn');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      suppressClickUntil = performance.now() + 350;
      btn.dataset.pointerHandled = '1';
      activateButton(btn, { x: e.clientX, y: e.clientY }, true);
      setTimeout(() => { delete btn.dataset.pointerHandled; }, 0);
    });

    list.addEventListener('click', e => {
      const btn = e.target.closest('.staff-btn');
      if (!btn || btn.disabled || btn.dataset.pointerHandled || performance.now() < suppressClickUntil) return;
      activateButton(btn);
    });
  }

  function setOpen(next) {
    open = next;
    if (panel) panel.hidden = !open;
    $('staffToggle')?.classList.toggle('active', open);
    if (open) {
      lastRenderKey = '';
      render();
    }
  }

  $('staffClose')?.addEventListener('click', () => setOpen(false));
  $('staffBackdrop')?.addEventListener('click', () => setOpen(false));

  return {
    render,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    isOpen: () => open,
  };
}
