// Marketing HQ overlay: hire Marketers, set a total income budget, then
// distribute it across campaign channels with per-channel weight sliders.
// Each channel has its own Demand bar, its own decay speed, and boosts a
// different income line — a portfolio view, not a research clone. Running
// several channels at once earns the Full Coverage efficiency bonus.
export function createMarketingPanel({
  document,
  marketing,
  staff,
  derived,
  research,
  monuments,
  excitement,
  channels,
  channelUnlocked,
  channelMultiplier,
  channelSaturation,
  steadyStateDemand,
  coverageBonus,
  marketingBudgetCap,
  clampMarketingPct,
  rebalanceWeights,
  maxWeight,
  fmt,
  onSetMarketingFunding,
  onWeightsChanged,
}) {
  const $ = id => document.getElementById(id);
  const panel = $('marketingPanel');
  const body = $('marketingBody');
  let open = false;
  let lastRenderKey = '';
  let sliderDragging = false;   // total-budget slider
  let weightDragging = null;    // channel key being dragged, if any

  const EFFECT_LABEL = {
    arrivalMult: 'guest arrivals',
    ticketMult: 'ticket price',
    vendorMult: 'guest spending',
    legacyMult: 'monument income',
  };

  function unlockCtx() {
    return { staff: staff(), researchDone: research().done || {}, monuments: monuments() };
  }

  const escText = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  // The department has a face: the top marketer runs the campaign desk.
  function deptHeadLine() {
    const people = staff().marketers?.people || [];
    if (!people.length) return '';
    const head = people.reduce((best, p) =>
      ((p.coverage || 0) * 10 + (p.level || 0)) > ((best.coverage || 0) * 10 + (best.level || 0)) ? p : best, people[0]);
    return `<div class="rsub dept-head">📣 Campaign desk: <b>${escText(head.name)}</b> · Lv ${head.level}/${head.potential}</div>`;
  }

  function unlockHint(c) {
    if (c.research && !(research().done || {})[c.research]) return 'research in the Marketing R&D path';
    if (c.needsMonument && monuments() <= 0) return 'retire a coaster first — tours need history';
    return 'hire a Marketer';
  }

  function fxCtx() {
    return { excitement: excitement() };
  }

  function unlockedChannels() {
    const ctx = unlockCtx();
    return channels.filter(c => channelUnlocked(c.key, ctx));
  }

  function fundedCount(unlocked) {
    return unlocked.filter(c => (marketing.channels[c.key]?.weight || 0) > 0).length;
  }

  function renderLocked() {
    body.innerHTML =
      `<div class="rcard marketing-funding">` +
      `<div class="rh">Marketing HQ Offline</div>` +
      `<div class="rpts">Hire a Marketer</div>` +
      `<div class="rsub">Marketers are hired from Staff. The first hire opens the campaign portfolio.</div>` +
      `</div>`;
  }

  function syncRange(el, ratio, value) {
    if (!el) return;
    const fill = el.querySelector('.research-range-fill');
    const thumb = el.querySelector('.research-range-thumb');
    el.setAttribute('aria-valuenow', String(value));
    el.dataset.value = String(value);
    if (fill) fill.style.width = `${ratio * 100}%`;
    if (thumb) thumb.style.left = `${ratio * 100}%`;
  }

  // Live numbers (demand bars, multipliers, steady projections, weights)
  // update in place every tick so drags stay smooth and open panels stay live.
  function updatePreview(pct, maxPct) {
    pct = Math.max(0, Math.min(maxPct, pct));
    const d = derived();
    const spendPerMin = Math.max(0, d.ratePerMin) * pct / 100;
    const pctEl = $('mkPct');
    const spendEl = $('mkSpend');
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (spendEl) spendEl.textContent = `$${fmt(spendPerMin)}/min`;
    syncRange($('mkSlider'), maxPct > 0 ? pct / maxPct : 0, pct);

    const ctx = fxCtx();
    const unlocked = unlockedChannels();
    const funded = fundedCount(unlocked);
    const totalWeight = unlocked.reduce((s, c) => s + (marketing.channels[c.key]?.weight || 0), 0);
    const coverageEl = $('mkCoverage');
    if (coverageEl) {
      coverageEl.textContent = funded > 1
        ? `Full Coverage x${coverageBonus(funded).toFixed(2)} — ${funded} channels funded`
        : `Fund 2+ channels for the Full Coverage bonus`;
    }
    for (const c of unlocked) {
      const slot = marketing.channels[c.key];
      const weight = slot.weight || 0;
      const share = totalWeight > 0 ? weight / totalWeight : 0;
      const bar = $(`mkBar-${c.key}`);
      const multEl = $(`mkChMult-${c.key}`);
      const weightEl = $(`mkWv-${c.key}`);
      const steadyEl = $(`mkSteady-${c.key}`);
      if (bar) bar.style.width = `${Math.min(100, channelSaturation(c.key, slot.demand) * 100)}%`;
      if (multEl) multEl.textContent = `x${channelMultiplier(c.key, slot.demand, ctx).toFixed(2)}`;
      if (weightEl) weightEl.textContent = `${Math.round(share * 100)}%`;
      // the slider shows this channel's slice of the whole marketing budget —
      // raising one visibly pulls the others down
      syncRange($(`mkW-${c.key}`), share, weight);
      if (steadyEl) {
        if (share > 0 && pct > 0) {
          const steady = steadyStateDemand(c.key, pct, share, staff(), funded);
          steadyEl.textContent = `→ x${channelMultiplier(c.key, steady, ctx).toFixed(2)} ${EFFECT_LABEL[c.effect]}`;
        } else {
          steadyEl.textContent = 'no budget → fades';
        }
      }
    }
  }

  // Shared pointer/keyboard drag wiring for both the budget slider and the
  // per-channel weight sliders.
  function bindRange(el, { max, step = 1, valueOf, commit, release }) {
    if (!el) return;
    const valueFromClientX = clientX => {
      const rect = el.getBoundingClientRect();
      if (!rect.width || max <= 0) return 0;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * max);
    };
    let active = false;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      active = true;
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      commit(valueFromClientX(e.clientX), true);
    });
    el.addEventListener('pointermove', e => {
      if (!active) return;
      e.preventDefault();
      commit(valueFromClientX(e.clientX), true);
    });
    const stop = e => {
      if (!active) return;
      active = false;
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      release();
    };
    el.addEventListener('pointerup', stop);
    el.addEventListener('pointercancel', stop);
    el.addEventListener('keydown', e => {
      const current = valueOf();
      let next = current;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next -= step;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next += step;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = max;
      else return;
      e.preventDefault();
      commit(next, false);
      release();
    });
  }

  function bindBudgetSlider(maxPct) {
    bindRange($('mkSlider'), {
      max: maxPct,
      valueOf: () => clampMarketingPct(marketing.fundingPct || 0, staff()),
      commit: (next, dragging) => {
        sliderDragging = dragging;
        const pct = clampMarketingPct(next, staff());
        onSetMarketingFunding(pct);
        updatePreview(pct, maxPct);
      },
      release: () => {
        sliderDragging = false;
        lastRenderKey = '';
        render();
      },
    });
  }

  function bindWeightSliders(maxPct) {
    for (const c of unlockedChannels()) {
      bindRange($(`mkW-${c.key}`), {
        max: maxWeight,
        step: 5,   // keyboard nudges move 5% of the budget at a time
        valueOf: () => {
          // current slice of the pie in slider units, whatever the raw sum is
          const unlocked = unlockedChannels();
          const total = unlocked.reduce((s, u) => s + (marketing.channels[u.key].weight || 0), 0);
          const weight = marketing.channels[c.key].weight || 0;
          return total > 0 ? Math.round(weight / total * maxWeight) : 0;
        },
        commit: (next, dragging) => {
          weightDragging = dragging ? c.key : null;
          rebalanceWeights(marketing, c.key, next);
          updatePreview(clampMarketingPct(marketing.fundingPct || 0, staff()), maxPct);
        },
        release: () => {
          weightDragging = null;
          lastRenderKey = '';
          render();
          onWeightsChanged();
        },
      });
    }
  }

  function channelRow(c) {
    const slot = marketing.channels[c.key];
    if (!channelUnlocked(c.key, unlockCtx())) {
      return `<div class="marketing-channel locked">` +
        `<div class="mch-head"><span class="mch-icon">${c.icon}</span>` +
        `<div><b>${c.name}</b><small>Locked — ${unlockHint(c)}</small></div></div>` +
        `</div>`;
    }
    const weight = slot.weight || 0;
    const ratio = 0;   // updatePreview sets the real budget-share position
    const sat = Math.min(100, channelSaturation(c.key, slot.demand) * 100);
    return `<div class="marketing-channel">` +
      `<div class="mch-head"><span class="mch-icon">${c.icon}</span>` +
      `<div><b>${c.name}</b><small>${c.desc}</small></div>` +
      `<span class="mch-mult" id="mkChMult-${c.key}">x1.00</span></div>` +
      `<div class="mch-controls">` +
      `<span class="mch-weight" id="mkWv-${c.key}"></span>` +
      `<div class="research-range mch-range" id="mkW-${c.key}" role="slider" tabindex="0" aria-label="${c.name} budget weight" aria-valuemin="0" aria-valuemax="${maxWeight}" aria-valuenow="${weight}" data-value="${weight}">` +
      `<div class="research-range-fill" style="width:${ratio * 100}%"></div>` +
      `<div class="research-range-thumb" style="left:${ratio * 100}%"></div>` +
      `</div>` +
      `<div class="marketing-demand"><div class="marketing-demand-fill" id="mkBar-${c.key}" style="width:${sat}%"></div></div>` +
      `<small class="mch-steady" id="mkSteady-${c.key}"></small>` +
      `</div></div>`;
  }

  function render() {
    if (!body) return;
    const crew = staff().marketers || { hired: 0, trained: 0 };
    const maxPct = marketingBudgetCap(staff());
    const pct = clampMarketingPct(marketing.fundingPct || 0, staff());
    const unlocked = unlockedChannels();
    const renderKey = JSON.stringify({
      pct, maxPct,
      unlocked: unlocked.map(c => c.key),
      weights: channels.map(c => marketing.channels[c.key].weight),
      crew: [crew.hired, crew.trained],
    });
    if (sliderDragging || weightDragging || renderKey === lastRenderKey) {
      updatePreview(pct, maxPct);
      return;
    }
    lastRenderKey = renderKey;

    if (!crew.hired) {
      renderLocked();
      return;
    }

    const d = derived();
    const spendPerMin = Math.max(0, d.ratePerMin) * pct / 100;
    body.innerHTML =
      `<div class="rcard marketing-funding">` +
      `<div class="rh">Campaign Budget</div>` +
      `<div class="rsub">Marketing uses <b id="mkPct">${pct}%</b> of income: ` +
      `<b id="mkSpend">$${fmt(spendPerMin)}/min</b> · capacity <b>${maxPct}%</b> from ${crew.hired} Marketer${crew.hired === 1 ? '' : 's'}.</div>` +
      `<div class="research-slider"><div id="mkSlider" class="research-range" role="slider" tabindex="0" min="0" max="${maxPct}" aria-valuemin="0" aria-valuemax="${maxPct}" aria-valuenow="${pct}" data-value="${pct}">` +
      `<div class="research-range-fill" style="width:${maxPct > 0 ? (pct / maxPct) * 100 : 0}%"></div>` +
      `<div class="research-range-thumb" style="left:${maxPct > 0 ? (pct / maxPct) * 100 : 0}%"></div>` +
      `</div></div>` +
      `<div class="rsub mch-coverage" id="mkCoverage"></div>` +
      `<div class="rsub">The sliders split one budget — raise a channel and the rest give way. Spreading earns Full Coverage; focusing builds one channel faster. Demand fades without upkeep.</div>` +
      deptHeadLine() +
      `</div>` +
      channels.map(c => channelRow(c)).join('');

    bindBudgetSlider(maxPct);
    bindWeightSliders(maxPct);
    updatePreview(pct, maxPct);
  }

  function setOpen(next) {
    open = next;
    if (panel) panel.hidden = !open;
    $('marketingToggle')?.classList.toggle('active', open);
    if (open) {
      lastRenderKey = '';
      render();
    }
  }

  $('marketingClose')?.addEventListener('click', () => setOpen(false));
  $('marketingBackdrop')?.addEventListener('click', () => setOpen(false));

  return {
    render,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    isOpen: () => open,
  };
}
