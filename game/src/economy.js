// Economy: the human player's money. Start $800. Kill +$300. Round win
// +$3,250. Round loss +$1,900, plus $500 per consecutive loss (cap $3,400).
// Bots always afford a rifle. Prices live in weapons.js WEAPONS.
export function createEconomy() {
  const e = { money: 800, kills: 0, losses: 0 };

  function canAfford(price) { return e.money >= price; }

  function buy(price) {
    if (!canAfford(price)) return false;
    e.money -= price;
    return true;
  }

  function onKill() {
    e.kills += 1;
    e.money += 300;
  }

  function onRoundEnd(won) {
    if (won) {
      e.money += 3250;
      e.losses = 0;
    } else {
      e.money += Math.min(1900 + 500 * e.losses, 3400);
      e.losses += 1;
    }
  }

  function reset() {
    e.money = 800;
    e.kills = 0;
    e.losses = 0;
  }

  return { get money() { return e.money; }, get kills() { return e.kills; }, canAfford, buy, onKill, onRoundEnd, reset };
}
