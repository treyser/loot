import OBR from "@owlbear-rodeo/sdk";
import { SHEETS } from "./common.js";

export async function getSheets() {
  const meta = await OBR.room.getMetadata();
  return meta[SHEETS] ?? {};
}

const num = (v) => Number(v) || 0;

// Видати здобич. shares: { [ownerId]: { coins, items } }
export async function give(shares) {
  const meta = await OBR.room.getMetadata();
  const sheets = { ...(meta[SHEETS] ?? {}) };

  for (const [owner, part] of Object.entries(shares)) {
    const sheet = sheets[owner];
    if (!sheet) continue;

    const next = { ...sheet };

    // У листі є лише зм, см і мм — платину переводимо в золото
    const c = part.coins ?? {};
    next.gp = String(num(next.gp) + num(c.gp) + num(c.pp) * 10);
    next.sp = String(num(next.sp) + num(c.sp));
    next.cp = String(num(next.cp) + num(c.cp));

    const gear = [...(next.gear ?? [])];
    for (const item of part.items ?? []) {
      const note = item.kind === "own"
        ? (item.note ?? "")
        : item.value
          ? `${item.value} зм`
          : item.rank
            ? "магія"
            : "";
      const same = gear.find((g) => g.name === item.name && (g.note ?? "") === note);
      if (same) same.qty = String(num(same.qty) + 1);
      else gear.push({ name: item.name, qty: "1", note });
    }
    next.gear = gear;

    sheets[owner] = next;
  }

  await OBR.room.setMetadata({ [SHEETS]: sheets });
}

// Порівну між отримувачами, решта — першому
export function split(result, owners) {
  const shares = {};
  if (!owners.length) return shares;

  for (const owner of owners) {
    shares[owner] = { coins: { cp: 0, sp: 0, gp: 0, pp: 0 }, items: [] };
  }

  for (const kind of ["cp", "sp", "gp", "pp"]) {
    const total = result.coins[kind] ?? 0;
    const each = Math.floor(total / owners.length);
    const rest = total - each * owners.length;
    owners.forEach((o, i) => {
      shares[o].coins[kind] = each + (i === 0 ? rest : 0);
    });
  }

  // предмети роздаємо по колу
  result.items.forEach((item, i) => {
    shares[owners[i % owners.length]].items.push(item);
  });

  return shares;
}
