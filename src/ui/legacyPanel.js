// Hall of Fame overlay: name the active coaster, see its certification progress,
// retire it into a monument for Fame, and spend Fame on permanent perks.
import {
  PERKS,
  PERK_ORDER,
  canBuyPerk,
  canRetire,
  certificationBar,
  effectiveExcitement,
  fameFor,
  monumentIncome,
  perkCost,
  qualityBar,
  qualityScore,
} from '../systems/legacy.js?v=20260703-13';

export function createLegacyPanel({
  document,
  getLegacy,
  getStats,
  getThemeBonus,
  getCoasterName,
  setCoasterName,
  fmt,
  onRetire,
  onBuyPerk,
}) {
  const $ = id => document.getElementById(id);
  const panel = $('legacyPanel');
  const list = $('legacyBody');
  let open = false;
  let lastRenderKey = '';

  function render() {
    if (!list) return;
    const legacy = getLegacy();
    const stats = getStats();
    const theme = getThemeBonus() || 0;
    const eff = Math.round(effectiveExcitement(stats, theme));
    const bar = certificationBar(legacy.generation);
    const craft = Math.round(qualityScore(stats));
    const craftBar = qualityBar(legacy.generation);
    const ready = canRetire(stats, theme, legacy.generation);
    const gain = fameFor(stats, theme);
    const pct = Math.min(100, Math.round((eff / bar) * 100));
    const craftPct = Math.min(100, Math.round((craft / craftBar) * 100));

    const key = JSON.stringify({
      fame: Math.floor(legacy.fame), gen: legacy.generation, eff, bar, craft, craftBar,
      mon: legacy.monuments.length, perks: PERK_ORDER.map(k => legacy.perks[k] || 0),
    });
    if (key === lastRenderKey) return;
    lastRenderKey = key;

    const perksHtml = PERK_ORDER.map(k => {
      const p = PERKS[k];
      const level = Math.floor(legacy.perks[k] || 0);
      const maxed = level >= p.max;
      const cost = perkCost(k, level);
      const afford = canBuyPerk(legacy, k);
      return `<div class="perk-row">` +
        `<div class="perk-ic">${p.icon}</div>` +
        `<div class="perk-info"><div class="perk-nm">${p.name} <span class="perk-lv">Lv ${level}${maxed ? ' (max)' : ''}</span></div>` +
        `<div class="perk-ds">${p.desc}</div></div>` +
        `<button class="perk-buy" data-perk="${k}" ${maxed || !afford ? 'disabled' : ''}>${maxed ? 'Max' : `★ ${fmt(cost)}`}</button>` +
        `</div>`;
    }).join('');

    const monumentsHtml = legacy.monuments.length
      ? [...legacy.monuments].reverse().map(m => {
          const inc = monumentIncome(m, legacy.perks);
          return `<div class="mon-row"><div class="mon-nm">${m.name}<small>Gen ${m.generation} · EXC ${Math.round(effectiveExcitement(m.stats, m.themeBonus))}</small></div>` +
            `<div class="mon-inc">+$${fmt(inc)}<small>/min</small></div></div>`;
        }).join('')
      : `<div class="mon-empty">No retired coasters yet — certify this one to start your Hall of Fame.</div>`;

    list.innerHTML =
      `<div class="lg-card">` +
        `<div class="lg-fame">★ <b>${fmt(legacy.fame)}</b> Fame</div>` +
        `<div class="lg-gen">Building Generation ${legacy.generation}</div>` +
      `</div>` +
      `<div class="lg-card">` +
        `<div class="lg-h">Certify & Retire</div>` +
        `<input class="lg-name" id="lgName" maxlength="40" placeholder="Coaster ${legacy.generation}" value="${(getCoasterName() || '').replace(/"/g, '&quot;')}">` +
        `<div class="lg-cert"><div class="lg-cert-bar"><div style="width:${pct}%" class="${ready ? 'ok' : ''}"></div></div>` +
        `<span>EXC <b>${eff}</b> / ${bar} to certify</span></div>` +
        `<div class="lg-cert"><div class="lg-cert-bar"><div style="width:${craftPct}%" class="${craft >= craftBar ? 'ok' : ''}"></div></div>` +
        `<span>Craft <b>${craft}</b> / ${craftBar} from drops, airtime, features & pacing</span></div>` +
        `<button class="lg-retire" id="lgRetire" ${ready ? '' : 'disabled'}>` +
          (ready ? `🏆 Retire — earn ★${fmt(gain)} Fame` : `Reach EXC ${bar} to certify`) +
        `</button>` +
        `<div class="lg-sub">${ready ? 'Retiring banks Fame, keeps your research & staff, and starts a fresh coaster with a grant.' : 'Build bigger and theme the track near the rails to raise excitement.'}</div>` +
      `</div>` +
      `<div class="lg-card"><div class="lg-h">Fame Perks</div>${perksHtml}</div>` +
      `<div class="lg-card"><div class="lg-h">Hall of Fame</div>${monumentsHtml}</div>`;

    const nameInput = $('lgName');
    if (nameInput) nameInput.addEventListener('input', e => setCoasterName(e.target.value));
    const retireButton = $('lgRetire');
    if (retireButton && !ready) retireButton.textContent = 'Clear both bars to certify';
    $('lgRetire')?.addEventListener('click', () => { onRetire(); });
    list.querySelectorAll('.perk-buy').forEach(btn => {
      btn.addEventListener('click', () => { if (onBuyPerk(btn.dataset.perk)) { lastRenderKey = ''; render(); } });
    });
  }

  function setOpen(next) {
    open = next;
    if (panel) panel.hidden = !open;
    $('legacyToggle')?.classList.toggle('active', open);
    if (open) { lastRenderKey = ''; render(); }
  }

  $('legacyClose')?.addEventListener('click', () => setOpen(false));
  $('legacyBackdrop')?.addEventListener('click', () => setOpen(false));

  return {
    render,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    isOpen: () => open,
  };
}
