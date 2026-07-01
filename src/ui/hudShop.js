export function createHudShop({
  document,
  categories,
  upgrades,
  shopOrder,
  research,
  researchOrder,
  budgets,
  derived,
  getPath,
  getState,
  getSim,
  hasResearch,
  gradeFor,
  upgradeCost,
  fmt,
  mph,
  onBuy,
  onResearchProject,
  onSetResearchBudget,
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

  function renderResearch(body) {
    const card = document.createElement('div');
    card.className = 'rcard';
    const rpm = Math.round(research.budget / 10);
    card.innerHTML =
      `<div class="rh">Research Points</div>` +
      `<div class="rpts" id="rpts">${Math.floor(research.points)} RP</div>` +
      `<div class="rsub">Funding research drains <b>$${research.budget}/min</b> -> <b>${rpm} RP/min</b></div>` +
      `<div class="budgets" id="budgets"></div>`;
    body.appendChild(card);

    const bdiv = card.querySelector('#budgets');
    budgets.forEach(budget => {
      const el = document.createElement('div');
      el.className = `budget${budget === research.budget ? ' active' : ''}`;
      el.textContent = budget === 0 ? 'Off' : `$${budget}`;
      el.addEventListener('click', () => {
        onSetResearchBudget(budget);
        renderShop();
      });
      bdiv.appendChild(el);
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

    const rp = $('rpts');
    if (rp) {
      rp.textContent = `${Math.floor(research.points)} RP`;
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
