import { INDIVIDUAL, HOARD, GEMS, ART, MAGIC, roll, pick, TIERS } from "./tables.js";

const coins = (table) => {
  const out = { cp: 0, sp: 0, gp: 0, pp: 0 };
  for (const [kind, [n, sides, mult]] of Object.entries(table)) {
    out[kind] = roll(n, sides) * mult;
  }
  return out;
};

const addCoins = (a, b) => ({
  cp: a.cp + b.cp, sp: a.sp + b.sp, gp: a.gp + b.gp, pp: a.pp + b.pp,
});

// Кишенькова здобич — з кожного вбитого ворога
export function individual(tierKey) {
  return { coins: coins(INDIVIDUAL[tierKey]), items: [] };
}

// Скарбниця: монети, самоцвіти або витвори, іноді магія
export function hoard(tierKey) {
  const result = { coins: coins(HOARD[tierKey]), items: [] };
  const d = roll(1, 100);

  // цінності
  const valuables = {
    t1: [[30, GEMS, 10, [2, 6]], [60, ART, 25, [2, 4]], [100, GEMS, 50, [2, 6]]],
    t2: [[30, ART, 25, [2, 4]], [55, GEMS, 50, [3, 6]], [80, GEMS, 100, [3, 6]], [100, ART, 250, [2, 4]]],
    t3: [[35, ART, 250, [2, 4]], [65, GEMS, 500, [3, 6]], [90, GEMS, 1000, [3, 6]], [100, ART, 750, [2, 4]]],
    t4: [[35, GEMS, 1000, [3, 6]], [70, ART, 2500, [1, 10]], [90, ART, 7500, [1, 4]], [100, GEMS, 5000, [1, 8]]],
  }[tierKey];

  for (const [limit, table, value, [n, sides]] of valuables) {
    if (d <= limit) {
      const count = roll(n, sides);
      for (let i = 0; i < count; i++) {
        result.items.push({
          name: pick(table[value]),
          value,
          kind: table === GEMS ? "gem" : "art",
        });
      }
      break;
    }
  }

  // магія — шанс і рівень залежать від рангу
  const magicChance = { t1: 40, t2: 60, t3: 80, t4: 95 }[tierKey];
  if (roll(1, 100) <= magicChance) {
    const pools = {
      t1: [["minor", 100]],
      t2: [["minor", 80], ["major", 100]],
      t3: [["minor", 40], ["major", 95], ["legendary", 100]],
      t4: [["major", 70], ["legendary", 100]],
    }[tierKey];

    const count = tierKey === "t1" ? roll(1, 2) : roll(1, 3);
    for (let i = 0; i < count; i++) {
      const r = roll(1, 100);
      const pool = pools.find(([, limit]) => r <= limit)?.[0] ?? "minor";
      result.items.push({ name: pick(MAGIC[pool]), kind: "magic", rank: pool });
    }
  }

  return result;
}

// Здобич із конкретного набору ворогів на сцені
export function fromMonsters(monsters) {
  let total = { cp: 0, sp: 0, gp: 0, pp: 0 };
  for (const m of monsters) {
    const tier = TIERS.find((t) => {
      const n = m.cr.includes("/") ? 0 : Number(m.cr);
      return n >= t.min && n <= t.max;
    }) ?? TIERS[0];
    total = addCoins(total, coins(INDIVIDUAL[tier.key]));
  }
  return { coins: total, items: [] };
}

// У золотому еквіваленті — щоб показати загальну цінність
export const worth = (result) =>
  Math.round(
    result.coins.cp / 100 + result.coins.sp / 10 + result.coins.gp +
    result.coins.pp * 10 +
    result.items.reduce((sum, i) => sum + (i.value ?? 0), 0)
  );
