// "For sale" purchase popup: opened by clicking a lot's sign in the 3D scene.
// Presentational only; the actual purchase goes through onBuy(key).
export function createLandPopup({
  document,
  getState,
  getOption,   // key -> { key, x, z, cost, width, depth, area } or null
  chunkSize,
  onBuy,
  fmt,
}) {
  const $ = id => document.getElementById(id);
  let currentKey = null;

  function plotName(option) {
    const dirs = [];
    if (option.z < 0) dirs.push('North');
    if (option.z > 0) dirs.push('South');
    if (option.x > 0) dirs.push('East');
    if (option.x < 0) dirs.push('West');
    return `${dirs.join('-') || 'Central'} Plot`;
  }

  function render() {
    const option = currentKey ? getOption(currentKey) : null;
    if (!option) { close(); return; }
    const money = getState().money;
    const width = Math.round(option.width || chunkSize());
    const depth = Math.round(option.depth || chunkSize());
    const area = Math.round(option.area || width * depth);
    $('landInfo').innerHTML =
      `<div class="land-name">${plotName(option)}</div>` +
      `<div class="land-detail"><span>Plot</span><b>${option.key}</b></div>` +
      `<div class="land-detail"><span>Size</span><b>${width}m x ${depth}m (${area}m2)</b></div>` +
      `<div class="land-detail"><span>Price</span><b class="land-price">$${fmt(option.cost)}</b></div>` +
      `<div class="land-detail"><span>Your funds</span><b>$${fmt(money)}</b></div>`;
    const buy = $('landBuy');
    buy.disabled = money < option.cost;
    buy.textContent = money < option.cost ? 'Not enough funds' : `Buy for $${fmt(option.cost)}`;
  }

  function open(key) {
    currentKey = key;
    render();
    if (currentKey) $('landPanel').hidden = false;
  }

  function close() {
    currentKey = null;
    const panel = $('landPanel');
    if (panel) panel.hidden = true;
  }

  $('landBuy')?.addEventListener('click', () => {
    if (currentKey) onBuy(currentKey);
  });
  $('landCancel')?.addEventListener('click', close);
  $('landBackdrop')?.addEventListener('click', close);

  return {
    open,
    close,
    render,
    isOpen: () => currentKey !== null,
  };
}
