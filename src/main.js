import "./style.css";
import OBR from "@owlbear-rodeo/sdk";
import { MONSTER, CUSTOM } from "./common.js";
import { TIERS } from "./tables.js";
import { hoard, individual, fromMonsters, worth } from "./generate.js";
import { getSheets, give, split } from "./give.js";

const $ = (id) => document.getElementById(id);

let mode = "hoard";
let result = null;
let chosen = new Set();

OBR.onReady(init);

async function init() {
  const isGM = (await OBR.player.getRole()) === "GM";
  $("gm").hidden = !isGM;
  $("player").hidden = isGM;
  if (!isGM) return;

  for (const t of TIERS) $("tier").appendChild(new Option(t.name, t.key));

  $("mode").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      mode = b.dataset.mode;
      $("mode").querySelectorAll("button").forEach((x) =>
        x.setAttribute("aria-selected", String(x.dataset.mode === mode))
      );
      $("tierBox").hidden = mode === "scene";
      result = null;
      render();
    })
  );

  $("roll").addEventListener("click", generate);
  $("give").addEventListener("click", handOut);
  $("ownAdd").addEventListener("click", () => addOwn(false));
  $("ownSave").addEventListener("click", () => addOwn(true));
  $("ownName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addOwn(false);
  });

  await drawOwnList();

  await drawPeople();
  render();
}

async function generate() {
  const tier = $("tier").value;

  if (mode === "scene") {
    const mobs = await OBR.scene.items.getItems((i) => Boolean(i.metadata[MONSTER]));
    if (!mobs.length) {
      $("hint").textContent = "На сцені немає ворогів, створених розширенням «Сутички»";
      result = null;
      render();
      return;
    }
    // CR беремо з бестіарію сутичок — він лишає id монстра в мітці
    const { BESTIARY } = await import("./bestiary-lite.js");
    const list = mobs
      .map((m) => BESTIARY.find((b) => b.id === Number(m.metadata[MONSTER])))
      .filter(Boolean);
    result = fromMonsters(list);
    $("hint").textContent = `Ворогів враховано: ${list.length}`;
  } else {
    result = mode === "hoard" ? hoard(tier) : individual(tier);
    $("hint").textContent = "";
  }

  render();
}

// --- власні предмети ---

// Додати предмет у поточну здобич; save — ще й запамʼятати для наступних разів
async function addOwn(save) {
  const name = $("ownName").value.trim();
  if (!name) {
    $("hint").textContent = "Впиши назву предмета";
    return;
  }
  const note = $("ownNote").value.trim();
  const qty = Math.max(1, Number($("ownQty").value) || 1);

  // здобич могло ще не бути згенеровано — починаємо з порожньої
  if (!result) result = { coins: { cp: 0, sp: 0, gp: 0, pp: 0 }, items: [] };

  for (let i = 0; i < qty; i++) {
    result.items.push({ name, note, kind: "own" });
  }

  if (save) {
    const meta = await OBR.room.getMetadata();
    const list = [...(meta[CUSTOM] ?? [])];
    if (!list.some((x) => x.name === name && (x.note ?? "") === note)) {
      list.push({ name, note });
      await OBR.room.setMetadata({ [CUSTOM]: list });
      await drawOwnList();
    }
  }

  $("ownName").value = "";
  $("ownNote").value = "";
  $("ownQty").value = 1;
  render();
}

async function drawOwnList() {
  const meta = await OBR.room.getMetadata();
  const list = meta[CUSTOM] ?? [];
  const box = $("ownList");
  box.innerHTML = "";

  if (!list.length) {
    box.innerHTML = '<div class="empty">Збережених предметів ще немає</div>';
    return;
  }

  list.forEach((item, index) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.title = "Додати до здобичі";
    chip.textContent = item.note ? `${item.name} (${item.note})` : item.name;

    chip.addEventListener("click", () => {
      if (!result) result = { coins: { cp: 0, sp: 0, gp: 0, pp: 0 }, items: [] };
      result.items.push({ name: item.name, note: item.note, kind: "own" });
      render();
    });

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "×";
    del.title = "Прибрати зі списку";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      const next = list.filter((_, i) => i !== index);
      await OBR.room.setMetadata({ [CUSTOM]: next });
      await drawOwnList();
    });

    chip.appendChild(del);
    box.appendChild(chip);
  });
}

async function drawPeople() {
  const sheets = await getSheets();
  const box = $("people");
  box.innerHTML = "";

  const entries = Object.entries(sheets);
  if (!entries.length) {
    box.innerHTML = '<div class="empty">Листів персонажів у кімнаті немає</div>';
    return;
  }

  for (const [owner, sheet] of entries) {
    const label = document.createElement("label");
    label.className = "person";

    const box2 = document.createElement("input");
    box2.type = "checkbox";
    box2.checked = true;
    chosen.add(owner);
    box2.addEventListener("change", () => {
      if (box2.checked) chosen.add(owner);
      else chosen.delete(owner);
    });

    const name = document.createElement("span");
    name.textContent = sheet.name?.trim() || "Без імені";

    label.append(box2, name);
    box.appendChild(label);
  }
}

function render() {
  const box = $("result");
  box.innerHTML = "";
  $("giveBox").hidden = !result;

  if (!result) return;

  const c = result.coins;
  const coinLine = [
    c.pp ? `${c.pp} пм` : null,
    c.gp ? `${c.gp} зм` : null,
    c.sp ? `${c.sp} см` : null,
    c.cp ? `${c.cp} мм` : null,
  ].filter(Boolean).join(" · ") || "монет немає";

  const head = document.createElement("div");
  head.className = "entry total";
  head.innerHTML = `<div class="name"><b>${coinLine}</b><small>усього приблизно ${worth(result)} зм</small></div>`;
  box.appendChild(head);

  result.items.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "entry";

    const tag = item.kind === "magic"
      ? "магія"
      : item.kind === "own"
        ? (item.note || "свій предмет")
        : `${item.value} зм`;

    const name = document.createElement("div");
    name.className = "name";
    name.innerHTML = `${item.name}<small>${tag}</small>`;

    const del = document.createElement("button");
    del.className = "drop";
    del.type = "button";
    del.textContent = "×";
    del.title = "Прибрати з здобичі";
    del.addEventListener("click", () => {
      result.items.splice(index, 1);
      render();
    });

    row.append(name, del);
    box.appendChild(row);
  });
}

async function handOut() {
  if (!result) return;
  const owners = [...chosen];
  if (!owners.length) {
    $("hint").textContent = "Обери, кому видати";
    return;
  }

  try {
    await give(split(result, owners));
    $("hint").textContent = `Видано. Отримувачів: ${owners.length}`;
    result = null;
    render();
  } catch (err) {
    $("hint").textContent = "Не вдалося видати: " + (err?.message ?? "невідома причина");
    console.error(err);
  }
}
