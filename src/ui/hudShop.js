export function createHudShop({
  document,
  categories,
  upgrades,
  shopOrder,
  derived,
  getMaintenance = () => null,
  decor = {},
  decorOrder = [],
  getSelectedDecor = () => null,
  onSelectDecor = () => {},
  getPath,
  getState,
  getSim,
  getMeasuredRate = () => null,   // rolling actual $/min; null until enough signal
  getExcitementBonus = () => 0,   // decor theming added on top of track excitement
  hasResearch,
  gradeFor,
  upgradeCost,
  fmt,
  mph,
  onBuy,
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
    if (activeTab === 'decor') {
      renderDecor(body);
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

  function renderDecor(body) {
    const card = document.createElement('div');
    card.className = 'rcard';
    card.innerHTML =
      `<div class="rh">Decorations</div>` +
      `<div class="rsub">Click owned land to place. <b>Scroll</b> raises for stacking, <b>R</b> rotates, ` +
      `pieces overlap freely — build structures around your coaster. Esc to stop.</div>`;
    body.appendChild(card);

    decorOrder.forEach(key => {
      const item = decor[key];
      const el = document.createElement('div');
      el.className = 'ticket decor-ticket';
      el.id = `decor-${key}`;
      el.innerHTML =
        `<div class="ic">${item.icon}</div>` +
        `<div class="body"><div class="nm">${item.name}</div><div class="ds">${item.desc}</div><div class="lv" id="decor-lv-${key}"></div></div>` +
        `<div class="cost">$${fmt(item.cost)}</div>`;
      el.addEventListener('click', () => onSelectDecor(key));
      body.appendChild(el);
    });

    const remove = document.createElement('div');
    remove.className = 'ticket decor-ticket';
    remove.id = 'decor-remove';
    remove.innerHTML =
      `<div class="ic">🗑</div>` +
      `<div class="body"><div class="nm">Demolish</div><div class="ds">Click placed pieces to remove them</div><div class="lv" id="decor-lv-remove"></div></div>` +
      `<div class="cost">+50%</div>`;
    remove.addEventListener('click', () => onSelectDecor('remove'));
    body.appendChild(remove);
    refreshHUD();
  }

  function refreshHUD() {
    const state = getState();
    const sim = getSim();
    const d = derived();
    const maintenance = getMaintenance();
    const path = getPath();
    const stats = path ? path.stats : null;

    $('money').textContent = fmt(state.money);
    // show what the park actually earned over the last minute once we have
    // signal; fall back to the model estimate while warming up
    const measured = getMeasuredRate();
    $('rate').textContent = `$${fmt(measured === null ? d.ratePerMin : measured)} / min`;
    $('riders').textContent = d.seatsCap;
    $('perride').textContent = `$${fmt(d.perRideFull)}`;
    $('queue').textContent = `${Math.round(sim.queue)}/${d.queueCap}`;

    if (stats) {
      $('topspeed').textContent = Math.round(stats.maxSpeed * mph);
      $('trackLen').textContent = `${stats.length}m`;
      $('laptime').textContent = `${stats.lapTime.toFixed(1)}s`;
      const exc = stats.excitement + getExcitementBonus();
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
        level.textContent = 'Needs research';
        return;
      }
      const cost = upgradeCost(upgrade);
      costEl.textContent = `$${fmt(cost)}`;
      level.textContent = upgrade.level > 0 ? `Lv ${upgrade.level}` : 'New';
      el.className = `ticket ${state.money >= cost ? 'affordable' : 'locked'}`;
    });

    const selected = getSelectedDecor();
    decorOrder.forEach(key => {
      const el = $(`decor-${key}`);
      if (!el) return;
      const item = decor[key];
      const affordable = state.money >= item.cost;
      el.classList.toggle('affordable', affordable);
      el.classList.toggle('locked', !affordable);
      el.classList.toggle('selected', selected === key);
      const lv = $(`decor-lv-${key}`);
      if (lv) lv.textContent = selected === key ? 'Placing — scroll raises · R rotates' : '';
    });
    const removeEl = $('decor-remove');
    if (removeEl) {
      removeEl.classList.add('affordable');
      removeEl.classList.toggle('selected', selected === 'remove');
      const lv = $('decor-lv-remove');
      if (lv) lv.textContent = selected === 'remove' ? 'Demolishing — click pieces' : '';
    }

  }

  return {
    buildShop,
    renderShop,
    refreshHUD,
  };
}
