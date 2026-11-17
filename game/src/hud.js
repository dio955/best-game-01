// DOM HUD. index.html provides the divs; this module only pushes numbers
// and text into them. It never touches the simulation.
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    crosshair: $('crosshair'), hitmarker: $('hitmarker'), dmgdir: $('dmgdir'),
    healthNum: $('health-num'), healthFill: $('health-fill'), armorFill: $('armor-fill'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), weaponName: $('weapon-name'),
    grenadeCount: $('grenade-count'), money: $('money'), timer: $('timer'),
    topbar: $('topbar'),
    scoreEmber: $('score-ember'), scoreWardens: $('score-wardens'), roundNum: $('round-num'),
    aliveEmber: $('alive-ember'), aliveWardens: $('alive-wardens'),
    bombStatus: $('bomb-status'), killfeed: $('killfeed'), buyMenu: $('buy-menu'),
    buyList: $('buy-list'), banner: $('banner'),
    overlayStart: $('overlay-start'), overlayPause: $('overlay-pause'), overlayEnd: $('overlay-end'),
    endTitle: $('end-title'), endScore: $('end-score'),
  };
  let hitTimer = null;
  let bannerTimer = null;
  let dmgTimer = null;

  function pips(el, alive, total) {
    if (!el) return;
    let html = '';
    for (let i = 0; i < total; i++) html += `<span class="pip${i < alive ? ' on' : ''}"></span>`;
    el.innerHTML = html;
  }

  return {
    setHealth(hp, armor) {
      if (els.healthNum) els.healthNum.textContent = Math.max(0, Math.ceil(hp));
      if (els.healthFill) els.healthFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
      if (els.armorFill) els.armorFill.style.width = `${Math.max(0, Math.min(100, armor))}%`;
    },
    setAmmo(mag, reserve, name) {
      if (els.ammoMag) els.ammoMag.textContent = mag;
      if (els.ammoReserve) els.ammoReserve.textContent = reserve;
      if (els.weaponName) els.weaponName.textContent = name;
    },
    setGrenades(n) { if (els.grenadeCount) els.grenadeCount.textContent = n; },
    setMoney(m) { if (els.money) els.money.textContent = `$${m}`; },
    setTimer(sec, phase) {
      if (!els.timer) return;
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      els.timer.textContent = `${m}:${String(s).padStart(2, '0')}`;
      els.timer.dataset.phase = phase || '';
    },
    setScore(ember, wardens, round) {
      if (els.scoreEmber) els.scoreEmber.textContent = ember;
      if (els.scoreWardens) els.scoreWardens.textContent = wardens;
      if (els.roundNum) els.roundNum.textContent = `ROUND ${round}`;
    },
    setAlive(emberAlive, wardensAlive) {
      pips(els.aliveEmber, emberAlive, 5);
      pips(els.aliveWardens, wardensAlive, 5);
    },
    setBomb(text) { if (els.bombStatus) els.bombStatus.textContent = text || ''; },
    setCrosshair(spreadPx) {
      if (!els.crosshair) return;
      const g = Math.max(4, Math.min(40, spreadPx));
      els.crosshair.style.setProperty('--gap', `${g}px`);
    },
    killfeed(text) {
      if (!els.killfeed) return;
      const div = document.createElement('div');
      div.className = 'kf';
      div.textContent = text;
      els.killfeed.prepend(div);
      // Keep the last 4 kills visible for the rest of the round (no timed
      // expiry — a death, the player's included, must still be readable
      // when someone looks at the feed).
      while (els.killfeed.children.length > 4) els.killfeed.lastChild.remove();
    },
    clearKillfeed() {
      if (els.killfeed) els.killfeed.innerHTML = '';
    },
    banner(text, ms = 2500) {
      if (!els.banner) return;
      els.banner.textContent = text;
      els.banner.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => els.banner.classList.remove('show'), ms);
    },
    showBuy(items, money) {
      if (!els.buyMenu || !els.buyList) return;
      els.buyList.innerHTML = items.map((it, i) =>
        `<div class="buy-item${it.owned ? ' owned' : ''}${it.afford ? '' : ' poor'}"><b>${i + 1}</b> ${it.name} — $${it.price}${it.owned ? ' (owned)' : ''}</div>`).join('');
      els.buyMenu.classList.add('show');
      this.setMoney(money);
    },
    hideBuy() { if (els.buyMenu) els.buyMenu.classList.remove('show'); },
    showOverlay(which) {
      for (const k of ['overlayStart', 'overlayPause', 'overlayEnd']) {
        if (els[k]) els[k].classList.toggle('show', k === which);
      }
      // At match end the topbar (ROUND / timer / score) is stale — the end
      // overlay carries the final score, so hide the bar until the next match.
      if (els.topbar) els.topbar.style.display = which === 'overlayEnd' ? 'none' : '';
    },
    hideOverlay() {
      for (const k of ['overlayStart', 'overlayPause', 'overlayEnd']) {
        if (els[k]) els[k].classList.remove('show');
      }
      if (els.topbar) els.topbar.style.display = '';
    },
    setEnd(winner, score) {
      if (els.endTitle) els.endTitle.textContent = winner === 'ember' ? 'EMBER WINS THE MATCH' : 'WARDENS WIN THE MATCH';
      if (els.endScore) els.endScore.textContent = `Final score — Ember ${score.ember} : ${score.wardens} Wardens`;
    },
    hitMarker(kill) {
      if (!els.hitmarker) return;
      els.hitmarker.classList.add('show');
      if (kill) els.hitmarker.classList.add('kill');
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => els.hitmarker.classList.remove('show', 'kill'), 150);
    },
    damageFrom(angleDeg) {
      if (!els.dmgdir) return;
      els.dmgdir.style.transform = `translate(-50%,-50%) rotate(${angleDeg}deg)`;
      els.dmgdir.classList.add('show');
      clearTimeout(dmgTimer);
      dmgTimer = setTimeout(() => els.dmgdir.classList.remove('show'), 600);
    },
    onPlay(cb) { $('btn-play')?.addEventListener('click', cb); },
    onAgain(cb) { $('btn-again')?.addEventListener('click', cb); },
    onResume(cb) { $('btn-resume')?.addEventListener('click', cb); },
    onBuy(cb) { els.buyMenu?.addEventListener('click', () => cb()); },
  };
}
