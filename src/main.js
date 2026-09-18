import "./style.css";
import OBR from "@owlbear-rodeo/sdk";
import { MONSTER } from "./common.js";
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

  for (const item of result.items) {
    const row = document.createElement("div");
    row.className = "entry";
    const tag = item.kind === "magic" ? "магія" : `${item.value} зм`;
    row.innerHTML = `<div class="name">${item.name}<small>${tag}</small></div>`;
    box.appendChild(row);
  }
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
