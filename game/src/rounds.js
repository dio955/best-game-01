// Round state machine: buy (15 s) -> live (100 s) -> planted (40 s bomb)
// -> end (5 s banner) -> next round. First to 5 round wins takes the match
// (max 9 rounds). Win: wipe the enemy team, bomb explodes (Ember), bomb
// defused (Wardens), or timer expires with no plant (Wardens).
export function createRounds(onEvent) {
  const r = {
    state: 'menu',
    roundNumber: 1,
    timer: 0,
    score: { ember: 0, wardens: 0 },
    bomb: { state: 'none', site: null, pos: null, timer: 0 },
  };

  function startMatch() {
    r.score = { ember: 0, wardens: 0 };
    r.roundNumber = 1;
    r.bomb = { state: 'none', site: null, pos: null, timer: 0 };
    startRound();
  }

  function startRound() {
    r.state = 'buy';
    r.timer = 15;
    r.bomb = { state: 'none', site: null, pos: null, timer: 0 };
  }

  function endRound(winner, reason) {
    if (r.state === 'end' || r.state === 'match') return;
    r.score[winner] += 1;
    r.state = 'end';
    r.timer = 5;
    onEvent.onRoundEnd(winner, reason, { ...r.score });
  }

  function plant(site) {
    if (r.state !== 'live') return;
    r.state = 'planted';
    r.bomb.state = 'planted';
    r.bomb.site = site;
    r.bomb.timer = 40;
    onEvent.onBombPlanted(site);
  }

  function defuse() {
    if (r.state !== 'planted') return;
    r.bomb.state = 'defused';
    endRound('wardens', 'defuse');
  }

  function explode() {
    r.bomb.state = 'exploded';
    endRound('ember', 'bomb');
  }

  function step(dt) {
    if (r.state === 'buy') {
      r.timer -= dt;
      if (r.timer <= 0) { r.state = 'live'; r.timer = 100; onEvent.onRoundLive(); }
    } else if (r.state === 'live') {
      r.timer -= dt;
      if (r.timer <= 0) endRound('wardens', 'time');
    } else if (r.state === 'planted') {
      r.bomb.timer -= dt;
      r.timer = r.bomb.timer;
      if (r.bomb.timer <= 0) { onEvent.onBombExploded(); explode(); }
    } else if (r.state === 'end') {
      r.timer -= dt;
      if (r.timer <= 0) {
        const matchOver = r.score.ember >= 5 || r.score.wardens >= 5 || r.roundNumber >= 9;
        if (matchOver) {
          r.state = 'match';
          onEvent.onMatchEnd(r.score.ember > r.score.wardens ? 'ember' : 'wardens', { ...r.score });
        } else {
          r.roundNumber += 1;
          startRound();
          onEvent.onRoundStart(r.roundNumber);
        }
      }
    }
  }

  function timeLeft() { return Math.max(0, Math.ceil(r.timer)); }
  function isLive() { return r.state === 'live' || r.state === 'planted'; }

  // Screenshot mode only: force a round state + timer (the shot modes
  // render a frozen frame, they never run the live state machine).
  function setShotState(state, timer) {
    r.state = state;
    r.timer = timer;
  }

  return {
    state: () => r.state,
    get roundNumber() { return r.roundNumber; },
    get timer() { return r.timer; },
    get score() { return r.score; },
    get bomb() { return r.bomb; },
    startMatch, startRound, endRound, plant, defuse, explode, step, timeLeft, isLive, setShotState,
  };
}
