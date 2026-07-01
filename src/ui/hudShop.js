export function createHudShop({
  document,
  categories,
  upgrades,
  shopOrder,
  research,
  researchOrder,
  derived,
  researchEfficiency = () => 1,
  getMaintenance = () => null,
  getProperty = () => null,
  getPropertyOptions = () => [],
  getPath,
  getState,
  getSim,
  hasResearch,
  gradeFor,
  upgradeCost,
  fmt,
  mph,
  onBuy,
  onBuyLand = () => {},
  onResearchProject,
  onSetResearchFunding,
}) {
  let activeTab = 'ride';
  const $ = id => document.getElementById(id);

  function buildShop() {
    const shop = $('shop');
    shop.innerHTML = '';
    const tabs = document.createElement('div');
    tabs.className = 'shop-tabs';
    categories.forEach(category => {
      const tab = document.createElement('div');
      tab.className = `tab${category.id === activeTab ? ' active' : ''}`;
      tab.id = `tab-${category.id}`;
      tab.innerHTML = `<div class="ti">${category.icon}</div><div class="tl">${category.name}</div>`;
      tab.addEventListener('click', () => {
        activeTab = category.id;
        document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
        tab.classList.add('active');
        renderShop();
      });
      tabs.appendChild(tab);
    });
    shop.appendChild(tabs);
    const body = document.createElement('div');
    body.className = 'shop-body';
    body.id = 'shopBody';
    shop.appendChild(body);
    renderShop();
  }

  function renderShop() {
    const body = $('shopBody');
    if (!body) return;
    body.innerHTML = '';
    if (activeTab === 'research') {
      renderResearch(body);
      return;
    }
    if (activeTab === 'property') {
      renderProperty(body);
      return;
    }

    shopOrder.filter(key => upgrades[key].cat === activeTab).forEach(key => {
      const upgrade = upgrades[key];
      const el = document.createElement('div');
      el.className = 'ticket';
      el.id = `up-${key}`;
      el.innerHTML =
        `<div class="ic">${upgrade.icon}</div>` +
        `<div class="body"><div class="nm">${upgrade.name}</div><div class="ds">${upgrade.desc}</div><div class="lv" id="lv-${key}"></div></div>` +
        `<div class="cost" id="cost-${key}"></div>`;
      el.addEventListener('click', () => onBuy(key));
      body.appendChild(el);
    });
    refreshHUD();
  }

  function renderProperty(body) {
    const property = getProperty();
    const options = getPropertyOptions();
    const card = document.createElement('div');
    card.className = 'rcard';
    card.innerHTML =
      `<div class="rh">Owned Land</div>` +
      `<div class="rpts" id="landOwned">${property?.owned?.length || 0} chunks</div>` +
      `<div class="rsub">Buy adjacent property to expand the buildable park boundary.</div>`;
    body.appendChild(card);

    options.forEach(option => {
      const el = document.createElement('div');
      el.className = 'ticket land-ticket';
      el.dataset.landKey = option.key;
      const label = option.x === 0
        ? option.z > 0 ? 'North Plot' : 'South Plot'
        : option.x > 0 ? 'East Plot' : 'West Plot';
      el.innerHTML =
        `<div class="ic">🧭</div>` +
        `<div class="body"><div class="nm">${label}</div><div class="ds">Chunk ${option.key} · ${property.chunkSize}m square</div><div class="lv">Adjacent expansion</div></div>` +
        `<div class="cost">$${fmt(option.cost)}</div>`;
      el.addEventListener('click', () => onBuyLand(option.key));
      body.appendChild(el);
    });
    refreshHUD();
  }

  function renderResearch(body) {
    const card = document.createElement('div');
    card.className = 'rcard';
    const pct = Math.max(0, Math.min(100, research.fundingPct || 0));
    const d = derived();
    const spendPerMin = Math.max(0, d.ratePerMin) * pct / 100;
    const eff = researchEfficiency(pct);
    const rpm = spendPerMin / 10 * eff;
    card.innerHTML =
      `<div class="rh">Research Points</div>` +
      `<div class="rpts" id="rpts">${Math.floor(research.points)} RP</div>` +
      `<div class="rsub">R&D uses <b id="rdPct">${pct}%</b> of income: <b id="rdSpend">$${fmt(spendPerMin)}/min</b> -> <b id="rdRp">${rpm.toFixed(1)} RP/min</b></div>` +
      `<div class="research-slider"><input id="rdSlider" type="range" min="0" max="80" step="1" value="${pct}"></div>`;
    body.appendChild(card);

    card.querySelector('#rdSlider').addEventListener('input', e => {
      onSetResearchFunding(Number(e.target.value));
    });

    researchOrder.forEach(key => {
      const project = research.projects[key];
      const done = hasResearch(key);
      const ready = !done && research.points >= project.rp;
      const el = document.createElement('div');
      el.className = `proj${done ? ' done' : ready ? ' ready' : ''}`;
      el.innerHTML =
        `<div class="ic">${project.icon}</div><div><div class="nm">${project.name}</div><div class="ds">${project.desc}</div></div>` +
        `<div class="rp">${done ? 'Done' : `${project.rp} RP`}</div>`;
      if (!done) el.addEventListener('click', () => onResearchProject(key));
      body.appendChild(el);
    });
  }

  function refreshHUD() {
    const state = getState();
    const sim = getSim();
    const d = derived();
    const maintenance = getMaintenance();
    const property = getProperty();
    const path = getPath();
    const stats = path ? path.stats : null;

    $('money').textContent = fmt(state.money);
    $('rate').textContent = `$${fmt(d.ratePerMin)} / min`;
    $('riders').textContent = d.seatsCap;
    $('perride').textContent = `$${fmt(d.perRideFull)}`;
    $('queue').textContent = `${Math.round(sim.queue)}/${d.queueCap}`;

    if (stats) {
      $('topspeed').textContent = Math.round(stats.maxSpeed * mph);
      $('trackLen').textContent = `${stats.length}m`;
      $('laptime').textContent = `${stats.lapTime.toFixed(1)}s`;
      const exc = stats.excitement;
      const intn = stats.intensity;
      const nau = stats.nausea;
      $('vExc').textContent = exc.toFixed(0);
      $('vInt').textContent = intn.toFixed(0);
      $('vNau').textContent = nau.toFixed(0);
      $('fExc').style.width = `${Math.min(100, exc)}%`;
      $('fInt').style.width = `${Math.min(100, intn)}%`;
      $('fNau').style.width = `${Math.min(100, nau)}%`;
      $('grade').textContent = gradeFor(exc);
    }

    shopOrder.forEach(key => {
      const el = $(`up-${key}`);
      if (!el) return;
      const upgrade = upgrades[key];
      const level = $(`lv-${key}`);
      const costEl = $(`cost-${key}`);
      const maxed = upgrade.max !== undefined && upgrade.level >= upgrade.max;
      const researchLocked = upgrade.requiresResearch && !hasResearch(upgrade.requiresResearch);
      const installed = maintenance?.installed?.[key];
      const pending =
        (maintenance?.queue?.filter(job => job.type === key).length || 0) +
        (maintenance?.current?.type === key ? 1 : 0);
      if ((key === 'car' || key === 'train') && pending > 0) {
        const cost = upgradeCost(upgrade);
        costEl.textContent = maxed ? 'MAX' : `$${fmt(cost)}`;
        level.textContent = `Lv ${installed} · ${pending} pending`;
        el.className = `ticket pending ${!maxed && state.money >= cost ? 'affordable' : 'locked'}`;
        return;
      }
      if (maxed) {
        el.className = 'ticket maxed';
        costEl.textContent = 'MAX';
        level.textContent = `Lv ${upgrade.level}`;
        return;
      }
      if (researchLocked) {
        el.className = 'ticket locked research-locked';
        costEl.textContent = 'R&D';
        level.textContent = 'Needs Auto Dispatch';
        return;
      }
      const cost = upgradeCost(upgrade);
      costEl.textContent = `$${fmt(cost)}`;
      level.textContent = upgrade.level > 0 ? `Lv ${upgrade.level}` : 'New';
      el.className = `ticket ${state.money >= cost ? 'affordable' : 'locked'}`;
    });

    document.querySelectorAll('.land-ticket').forEach(el => {
      const option = getPropertyOptions().find(candidate => candidate.key === el.dataset.landKey);
      if (!option) return;
      el.classList.toggle('affordable', state.money >= option.cost);
      el.classList.toggle('locked', state.money < option.cost);
      const costEl = el.querySelector('.cost');
      if (costEl) costEl.textContent = `$${fmt(option.cost)}`;
    });
    if ($('landOwned') && property) $('landOwned').textContent = `${property.owned.length} chunks`;

    const rp = $('rpts');
    if (rp) {
      rp.textContent = `${Math.floor(research.points)} RP`;
      const pct = Math.max(0, Math.min(100, research.fundingPct || 0));
      const spendPerMin = Math.max(0, d.ratePerMin) * pct / 100;
      const rpm = spendPerMin / 10 * researchEfficiency(pct);
      if ($('rdPct')) $('rdPct').textContent = `${pct}%`;
      if ($('rdSpend')) $('rdSpend').textContent = `$${fmt(spendPerMin)}/min`;
      if ($('rdRp')) $('rdRp').textContent = `${rpm.toFixed(1)} RP/min`;
      const slider = $('rdSlider');
      if (slider && Number(slider.value) !== pct) slider.value = pct;
      document.querySelectorAll('#shopBody .proj').forEach((el, i) => {
        const key = researchOrder[i];
        if (!key || hasResearch(key)) return;
        el.classList.toggle('ready', research.points >= research.projects[key].rp);
      });
    }
  }

  return {
    buildShop,
    renderShop,
    refreshHUD,
  };
}
