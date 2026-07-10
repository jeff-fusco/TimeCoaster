// Park balance overlay: an RCT-style readout of how the headline $/min is built.
export function createBalancePanel({
  document,
  derived,
  getState,
  getResearch,
  getMeasuredRate = () => null,   // rolling actual $/min from the income tracker
  canSpendResearch = () => true,
  getMarketing = () => null,
  getMarketingFundingPct = marketing => marketing?.fundingPct || 0,
  canSpendMarketing = () => false,
  getMarketingFx = () => ({ arrivalMult: 1, ticketMult: 1, vendorMult: 1, legacyMult: 1 }),
  getPayroll = () => 0,
  researchPaths = {},
  projects = {},
  pathProjectState = () => null,
  fmt,
}) {
  const $ = id => document.getElementById(id);
  const panel = $('balancePanel');
  const sheet = $('balanceSheet');
  let open = false;
  let lastRenderKey = '';

  const money = value => `$${fmt(Math.max(0, value || 0))}`;
  const signedMoney = value => `${value < 0 ? '-' : ''}$${fmt(Math.abs(value || 0))}`;
  const pct = value => `${Math.round((value || 0) * 100)}%`;
  const mult = value => `x${(value || 1).toFixed(2)}`;

  function bottleneckLabel(d, arrivalBoard) {
    const options = [
      { key: 'Seats', value: d.seatsCap, hint: 'add cars or seats' },
      { key: 'Queue', value: d.queueCap, hint: 'expand queue capacity' },
      { key: 'Guests', value: arrivalBoard, hint: 'build Demand or excitement' },
    ].sort((a, b) => a.value - b.value);
    const limited = options[0];
    return `${limited.key} - ${limited.hint}`;
  }

  function row(label, value, note = '') {
    return `<div class="balance-row"><span>${label}${note ? `<small>${note}</small>` : ''}</span><b>${value}</b></div>`;
  }

  function section(title, rows) {
    return `<div class="balance-section"><div class="balance-section-title">${title}</div>${rows.join('')}</div>`;
  }

  function render() {
    if (!sheet) return;
    const d = derived();
    const state = getState();
    const research = getResearch();
    const activeResearch = pathProjectState(research, researchPaths, projects);
    const researchActive = !!activeResearch?.project && !activeResearch.complete && canSpendResearch();
    const researchSpend = researchActive ? Math.max(0, d.ratePerMin) * (research.fundingPct || 0) / 100 : 0;
    const marketing = getMarketing();
    const marketingActive = !!marketing && canSpendMarketing();
    const marketingPct = marketingActive ? Math.max(0, getMarketingFundingPct(marketing)) : 0;
    const marketingSpend = marketingActive ? Math.max(0, d.ratePerMin) * marketingPct / 100 : 0;
    const mfx = getMarketingFx();
    const marketingMult = mfx.arrivalMult || 1;
    const payroll = Math.max(0, getPayroll());
    const netPerMin = d.ratePerMin - researchSpend - marketingSpend - payroll;
    const arrivalBoard = d.arrivalRate * d.cycle / Math.max(1, d.trains);
    const estBoard = Math.min(d.seatsCap, d.queueCap, arrivalBoard);
    const trainsPerMin = 60 / d.cycle * d.trains;
    const express = d.express || 0;
    const fullRide = Math.round(d.seatsCap * d.perRider);
    const fullVendors = Math.round(d.seatsCap * d.vendorPerRider);
    const fullPhotos = d.seatsCap > 0 ? Math.round(d.photoPerRide) : 0;
    const fullMerch = Math.round(d.seatsCap * d.perRider * d.merchRate);
    const estRideDispatch = Math.round(estBoard * d.perRider);
    const estVendorDispatch = Math.round(estBoard * d.vendorPerRider);
    const estPhotoDispatch = estBoard > 0.5 ? Math.round(d.photoPerRide) : 0;
    const estMerchDispatch = Math.round(estBoard * d.perRider * d.merchRate);

    const measured = getMeasuredRate();
    const renderKey = JSON.stringify({
      funds: Math.floor(state.money),
      measured: measured === null ? null : Math.floor(measured),
      gross: Math.floor(d.ratePerMin),
      net: Math.floor(netPerMin),
      ride: Math.floor(d.ridePerMin),
      snack: Math.floor(d.snackPerMin),
      royalty: Math.floor(d.royaltyPerMin),
      spend: Math.floor(researchSpend),
      payroll: Math.floor(payroll),
      marketingSpend: Math.floor(marketingSpend),
      marketingPct,
      marketingFx: [mfx.arrivalMult, mfx.ticketMult, mfx.vendorMult, mfx.legacyMult].map(v => Math.floor((v || 1) * 1000)),
      pct: research.fundingPct || 0,
      board: Math.floor(estBoard * 10),
      cycle: Math.floor(d.cycle * 10),
    });
    if (renderKey === lastRenderKey) return;
    lastRenderKey = renderKey;

    sheet.innerHTML =
      `<div class="balance-summary">` +
      `<div><span>Funds</span><b>${money(state.money)}</b></div>` +
      `<div><span>Gross</span><b>${money(d.ratePerMin)}/min</b></div>` +
      `<div><span>Net</span><b class="${netPerMin >= 0 ? 'good' : 'bad'}">${signedMoney(netPerMin)}/min</b></div>` +
      `</div>` +
      section('Per Rider', [
        row('Ticket value', money(d.ticket), 'base ticket plus premium research'),
        row('Express add-on', money(express), 'from express pass upgrades'),
        row('Ride rating', mult(d.ratingMult), 'excitement, marketing, cleanliness'),
        row('Park hype', mult(d.hype), 'hype upgrades'),
        row('Reliability', mult(d.upkeepMult), 'mechanic training'),
        row('Photo research', mult(d.researchMult), 'On-Ride Photo'),
        row('Ride take', money(d.perRider), 'per boarded guest'),
        row('Vendors', money(d.vendorPerRider), `${pct(d.hatFrac)} hats, ${pct(d.balloonFrac)} balloons`),
      ]) +
      section('Per Dispatch', [
        row('Full train ride take', money(fullRide), `${d.seatsCap} seats`),
        row('Estimated ride take', money(estRideDispatch), `${estBoard.toFixed(1)} guests expected`),
        row('Photo sales', money(estPhotoDispatch), fullPhotos ? `${money(fullPhotos)} on a full train` : 'hire photographers'),
        row('Hats and balloons', money(estVendorDispatch), fullVendors ? `${money(fullVendors)} on a full train` : 'vendor carts'),
        row('Exit merch', money(estMerchDispatch), d.merchRate ? `${pct(d.merchRate)} of ride take` : 'locked by research'),
      ]) +
      section('Per Minute', [
        row('Ride dispatches', money(d.ridePerMin), `${trainsPerMin.toFixed(2)} dispatches/min`),
        row('Snack stands', money(d.snackPerMin), `${Math.round(d.snackCap)} guest snack cap`),
        row('Royalties', money(d.royaltyPerMin), d.royaltyPerMin ? 'Reality Licensing' : 'locked by research'),
        row('Projected gross', `${money(d.ratePerMin)}/min`, 'model estimate'),
        row('Measured income', measured === null ? 'warming up…' : `${money(measured)}/min`, 'actually banked, last 60s'),
        row('R&D funding', `-${money(researchSpend)}/min`, researchActive ? `${research.fundingPct || 0}% of income` : 'no active project'),
        row('Marketing', `-${money(marketingSpend)}/min`, marketingActive ? `${marketingPct}% across campaign channels` : 'hire marketers'),
        row('Payroll', `-${money(payroll)}/min`, payroll > 0 ? 'staff wages' : 'no staff on payroll'),
        row('Net income', `${signedMoney(netPerMin)}/min`),
      ]) +
      section('Throughput', [
        row('Train cycle', `${d.cycle.toFixed(1)}s`, `${d.trains} train${d.trains === 1 ? '' : 's'}`),
        row('Boarded/dispatch', estBoard.toFixed(1), `seats ${d.seatsCap}, queue ${d.queueCap}`),
        row('Guest arrivals', `${d.arrivalRate.toFixed(1)}/sec`, `${arrivalBoard.toFixed(1)} guests per train cycle`),
        row('Campaign arrivals', mult(marketingMult), 'Street Team x Broadcast demand'),
        ...(mfx.ticketMult > 1.001 ? [row('Ride Spotlight', mult(mfx.ticketMult), 'ticket premium')] : []),
        ...(mfx.vendorMult > 1.001 ? [row('Family Package', mult(mfx.vendorMult), 'guest spending')] : []),
        ...(mfx.legacyMult > 1.001 ? [row('Heritage Tours', mult(mfx.legacyMult), 'monument income')] : []),
        row('Limited by', bottleneckLabel(d, arrivalBoard)),
      ]);
  }

  function setOpen(next) {
    open = next;
    if (panel) panel.hidden = !open;
    document.querySelector('.bank')?.classList.toggle('active', open);
    if (open) {
      lastRenderKey = '';
      render();
    }
  }

  $('balanceClose')?.addEventListener('click', () => setOpen(false));
  $('balanceBackdrop')?.addEventListener('click', () => setOpen(false));

  return {
    render,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    isOpen: () => open,
  };
}
