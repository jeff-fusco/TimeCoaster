// R&D overlay: choose a research field, fund it, and reveal unlocks one at a time.
export function createResearchPanel({
  document,
  research,
  projects,
  researchPaths,
  derived,
  staff,
  fundingEfficiency = () => 1,
  researchFundingCap = () => 0,
  clampResearchFundingPct = pct => Math.max(0, pct),
  pathProjectState,
  fmt,
  onSetActivePath,
  onSetResearchFunding,
}) {
  const $ = id => document.getElementById(id);
  const panel = $('researchPanel');
  const list = $('researchList');
  let open = false;
  let lastRenderKey = '';
  let sliderDragging = false;

  function scientistState() {
    return staff().scientists || { hired: 0, trained: 0 };
  }

  const escText = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  // The department has a face: the top scientist headlines the lab.
  function deptHeadLine(sci) {
    const people = sci.people || [];
    if (!people.length) return '';
    const head = people.reduce((best, p) =>
      ((p.coverage || 0) * 10 + (p.level || 0)) > ((best.coverage || 0) * 10 + (best.level || 0)) ? p : best, people[0]);
    return `<div class="rsub dept-head">🔬 Head of R&D: <b>${escText(head.name)}</b> · Lv ${head.level}/${head.potential}</div>`;
  }

  function renderLocked() {
    list.innerHTML =
      `<div class="rcard research-funding">` +
      `<div class="rh">R&D Lab Offline</div>` +
      `<div class="rpts">Hire a Scientist</div>` +
      `<div class="rsub">Scientists are hired from Staff. The first hire unlocks research and a 7% R&D budget.</div>` +
      `</div>`;
  }

  function updateFundingPreview(pct, active, d, sci, maxPct = researchFundingCap(staff())) {
    pct = Math.max(0, Math.min(maxPct, pct));
    const spendPerMin = Math.max(0, d.ratePerMin) * pct / 100;
    const efficiency = fundingEfficiency(pct, staff());
    const researchPerMin = spendPerMin * efficiency * (sci.hired ? 1 + sci.trained * 0.18 : 0);
    const pctEl = $('rdPct');
    const spendEl = $('rdSpend');
    const progressEl = $('rdRp');
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (spendEl) spendEl.textContent = `$${fmt(spendPerMin)}/min`;
    if (progressEl) progressEl.textContent = `$${fmt(researchPerMin)}/min progress`;
    syncFundingSlider(pct, maxPct);
    if (active?.project) {
      const pctDone = Math.floor(active.ratio * 100);
      const bar = document.querySelector('.research-progress div');
      const meter = document.querySelector('.research-meter');
      if (bar) bar.style.width = `${pctDone}%`;
      if (meter) meter.innerHTML = `<span>$${fmt(active.progress)} / $${fmt(active.cost)}</span><b>${pctDone}%</b>`;
    }
  }

  function syncFundingSlider(pct, maxPct = researchFundingCap(staff())) {
    const slider = $('rdSlider');
    if (!slider) return;
    pct = Math.max(0, Math.min(maxPct, pct));
    const ratio = maxPct > 0 ? pct / maxPct : 0;
    const fill = slider.querySelector('.research-range-fill');
    const thumb = slider.querySelector('.research-range-thumb');
    slider.setAttribute('aria-valuenow', String(pct));
    slider.dataset.value = String(pct);
    if (fill) fill.style.width = `${ratio * 100}%`;
    if (thumb) thumb.style.left = `${ratio * 100}%`;
  }

  function bindFundingSlider(active, d, sci, maxPct) {
    const slider = $('rdSlider');
    if (!slider) return;
    const valueFromClientX = clientX => {
      const rect = slider.getBoundingClientRect();
      if (!rect.width || maxPct <= 0) return 0;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return clampResearchFundingPct(Math.round(ratio * maxPct), staff());
    };
    const commit = next => {
      updateFundingPreview(next, active, d, sci, maxPct);
      onSetResearchFunding(next);
    };
    const stopDrag = e => {
      if (!sliderDragging) return;
      sliderDragging = false;
      try { slider.releasePointerCapture(e.pointerId); } catch (_) {}
      lastRenderKey = '';
      render();
    };
    slider.addEventListener('pointerdown', e => {
      e.preventDefault();
      sliderDragging = true;
      slider.setPointerCapture(e.pointerId);
      commit(valueFromClientX(e.clientX));
    });
    slider.addEventListener('pointermove', e => {
      if (!sliderDragging) return;
      e.preventDefault();
      commit(valueFromClientX(e.clientX));
    });
    slider.addEventListener('pointerup', stopDrag);
    slider.addEventListener('pointercancel', stopDrag);
    slider.addEventListener('keydown', e => {
      const current = Number(slider.dataset.value || 0);
      let next = current;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next -= 1;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next += 1;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = maxPct;
      else return;
      e.preventDefault();
      commit(clampResearchFundingPct(next, staff()));
    });
  }

  function render() {
    if (!list) return;
    const sci = scientistState();
    const d = derived();
    const maxPct = researchFundingCap(staff());
    const pct = clampResearchFundingPct(research.fundingPct || 0, staff());
    const spendPerMin = Math.max(0, d.ratePerMin) * pct / 100;
    const efficiency = fundingEfficiency(pct, staff());
    const researchPerMin = spendPerMin * efficiency * (sci.hired ? 1 + sci.trained * 0.18 : 0);
    const active = pathProjectState(research, researchPaths, projects);
    const renderKey = JSON.stringify({
      activePath: research.activePath,
      activeProgress: active ? Math.floor(active.progress) : 0,
      rate: Math.floor(d.ratePerMin),
      sci: [sci.hired, sci.trained],
      done: Object.keys(research.done).filter(key => research.done[key]).sort(),
    });
    if (sliderDragging || renderKey === lastRenderKey) {
      updateFundingPreview(pct, active, d, sci, maxPct);
      return;
    }
    lastRenderKey = renderKey;

    if (!sci.hired) {
      renderLocked();
      return;
    }

    list.innerHTML =
      `<div class="rcard research-funding">` +
      `<div class="rh">Research Funding</div>` +
      `<div class="rpts">${active?.project ? active.project.name : 'All Paths Complete'}</div>` +
      `<div class="rsub">R&D uses <b id="rdPct">${pct}%</b> of income: ` +
      `<b id="rdSpend">$${fmt(spendPerMin)}/min</b> -> <b id="rdRp">$${fmt(researchPerMin)}/min progress</b></div>` +
      `<div class="rsub">Scientists allow up to <b>${maxPct}%</b> of income for R&D.</div>` +
      `<div class="research-slider"><div id="rdSlider" class="research-range" role="slider" tabindex="0" min="0" max="${maxPct}" aria-valuemin="0" aria-valuemax="${maxPct}" aria-valuenow="${pct}" data-value="${pct}">` +
      `<div class="research-range-fill" style="width:${maxPct > 0 ? (pct / maxPct) * 100 : 0}%"></div>` +
      `<div class="research-range-thumb" style="left:${maxPct > 0 ? (pct / maxPct) * 100 : 0}%"></div>` +
      `</div></div>` +
      deptHeadLine(sci) +
      `</div>`;

    bindFundingSlider(active, d, sci, maxPct);

    const pathWrap = document.createElement('div');
    pathWrap.className = 'research-paths';
    Object.entries(researchPaths).forEach(([pathKey, path]) => {
      const state = pathProjectState(research, researchPaths, projects, pathKey);
      const doneCount = path.projects.filter(key => research.done[key]).length;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `research-path${pathKey === research.activePath ? ' active' : ''}${state.complete ? ' complete' : ''}`;
      row.innerHTML =
        `<span class="path-ic">${path.icon}</span>` +
        `<span><b>${path.name}</b><small>${state.complete ? 'Complete' : pathKey === research.activePath ? 'Active field' : doneCount ? 'Progress made' : 'Unexplored'}</small></span>`;
      row.addEventListener('click', () => {
        onSetActivePath(pathKey);
        lastRenderKey = '';
        render();
      });
      pathWrap.appendChild(row);
    });
    list.appendChild(pathWrap);

    if (active?.project) {
      const pctDone = Math.floor(active.ratio * 100);
      const card = document.createElement('div');
      card.className = 'research-current';
      card.innerHTML =
        `<div class="current-head"><span>${active.project.icon}</span><div><b>${active.project.name}</b><small>Current project</small></div></div>` +
        `<div class="rsub">${active.project.desc}</div>` +
        `<div class="research-progress"><div style="width:${pctDone}%"></div></div>` +
        `<div class="research-meter"><span>$${fmt(active.progress)} / $${fmt(active.cost)}</span><b>${pctDone}%</b></div>`;
      list.appendChild(card);
    }
  }

  function setOpen(next) {
    open = next;
    if (panel) panel.hidden = !open;
    $('researchToggle')?.classList.toggle('active', open);
    if (open) {
      lastRenderKey = '';
      render();
    }
  }

  $('researchClose')?.addEventListener('click', () => setOpen(false));
  $('researchBackdrop')?.addEventListener('click', () => setOpen(false));

  return {
    render,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    isOpen: () => open,
  };
}
