// Staff management overlay: hire members of each role and train the role.
// Purely presentational — hire/train money handling is injected via callbacks.
export function createStaffPanel({
  document,
  staffConfig,
  staffOrder,
  getStaff,
  getState,
  costs,        // { hire(role, staff), train(role, staff), canHire(role, staff), canTrain(role, staff) }
  describe = () => '',   // (role, entry) -> live status line
  onHire,
  onTrain,
  onSpendFeedback = () => {},
  fmt,
}) {
  const $ = id => document.getElementById(id);
  const panel = $('staffPanel');
  const list = $('staffList');
  let open = false;
  let lastRenderKey = '';
  let feedback = null;
  let suppressClickUntil = 0;

  function render() {
    if (!list) return;
    const staff = getStaff();
    const money = getState().money;
    const renderKey = JSON.stringify({
      money: Math.floor(money),
      staff: staffOrder.map(role => [role, staff[role]?.hired, staff[role]?.trained]),
    });
    if (renderKey === lastRenderKey) return;
    lastRenderKey = renderKey;
    list.innerHTML = '';
    staffOrder.forEach(role => {
      const cfg = staffConfig[role];
      const s = staff[role];
      const hireable = costs.canHire(role, staff);
      const trainable = costs.canTrain(role, staff);
      const hCost = costs.hire(role, staff);
      const tCost = costs.train(role, staff);
      const atTrainMax = s.trained >= cfg.trainMax;
      const isFeedback = feedback?.role === role && performance.now() - feedback.time < 850;

      const row = document.createElement('div');
      row.className = `staff-row${isFeedback ? ' staff-flash' : ''}`;
      row.innerHTML =
        `<div class="s-ic">${cfg.icon}</div>` +
        `<div class="s-info">` +
        `<div class="s-nm">${cfg.name} <span class="s-count">×${s.hired}</span>` +
        `<span class="s-tr"> · Training Lv ${s.trained}${atTrainMax ? ' (max)' : ''}</span></div>` +
        `<div class="s-ds">${cfg.desc}</div>` +
        `<div class="s-fx"><b>Hire</b> ${cfg.hireDesc}</div>` +
        `<div class="s-fx"><b>Train</b> ${cfg.trainDesc}</div>` +
        `<div class="s-status">${describe(role, s)}</div>` +
        `${isFeedback ? `<div class="s-feedback">${feedback.text}</div>` : ''}` +
        `</div>` +
        `<div class="s-acts">` +
        `<button class="staff-btn" data-act="hire" data-role="${role}" ${!hireable || money < hCost ? 'disabled' : ''}>` +
        `${hireable ? `Hire $${fmt(hCost)}` : 'Full'}</button>` +
        `<button class="staff-btn train" data-act="train" data-role="${role}" ${!trainable || money < tCost ? 'disabled' : ''}>` +
        `${atTrainMax ? 'Max' : trainable ? `Train $${fmt(tCost)}` : 'Hire first'}</button>` +
        `</div>`;
      list.appendChild(row);
    });
  }

  function activateButton(btn, point = null) {
    if (!btn || btn.disabled) return;
    const { act, role } = btn.dataset;
    const spent = act === 'hire' ? onHire(role) : onTrain(role);
    if (spent > 0) {
      const rect = btn.getBoundingClientRect();
      const x = point?.x ?? rect.left + rect.width / 2;
      const y = point?.y ?? rect.top + rect.height / 2;
      feedback = {
        role,
        time: performance.now(),
        text: `${act === 'hire' ? 'Hired' : 'Trained'} -$${fmt(spent)}`,
      };
      onSpendFeedback(spent, x, y, { act, role });
      lastRenderKey = '';
    }
    render();
  }

  if (list) {
    list.addEventListener('pointerdown', e => {
      const btn = e.target.closest('.staff-btn');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      suppressClickUntil = performance.now() + 350;
      btn.dataset.pointerHandled = '1';
      activateButton(btn, { x: e.clientX, y: e.clientY });
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
