const CATEGORY_ICON_RULES = [
  { kind: "palette", keywords: ["arte", "pintura", "lienzo", "pincel", "manualidad", "fomi"] },
  { kind: "monitor", keywords: ["tecnologia", "usb", "mouse", "teclado", "impresora", "tinta"] },
  { kind: "pencil", keywords: ["escolar", "cuaderno", "lapiz", "borrador", "crayones", "regla"] },
  { kind: "binders", keywords: ["oficina", "carpeta", "archivador", "resma", "folder", "papel"] },
  { kind: "box", keywords: ["industrial", "limpieza", "empaque", "rollo", "papel higienico"] }
];

const PRODUCT_VISUAL_RULES = [
  { kind: "paint", keywords: ["pintura", "tempera", "acuarela", "oleo", "lienzo", "pincel"] },
  { kind: "tech", keywords: ["teclado", "mouse", "usb", "memoria", "monitor", "impresora", "tinta"] },
  { kind: "notebook", keywords: ["cuaderno", "libreta", "agenda", "block", "papel"] },
  { kind: "pencil", keywords: ["lapiz", "portaminas", "regla", "borrador", "sacapuntas"] },
  { kind: "markers", keywords: ["marcador", "resaltador", "plumon", "crayones", "colores"] },
  { kind: "binders", keywords: ["carpeta", "archivador", "folder", "binder"] },
  { kind: "bag", keywords: ["morral", "mochila", "bolso"] },
  { kind: "calculator", keywords: ["calculadora"] },
  { kind: "box", keywords: ["rollo", "industrial", "empaque", "caja"] }
];

const COLOR_THEMES = [
  ["#24548f", "#173b67"],
  ["#1f6aa5", "#17324d"],
  ["#2f855a", "#1c5b3d"],
  ["#8d5f1f", "#5f3d11"],
  ["#6b46c1", "#422b7e"]
];

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function titleCase(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function buildSource(entity) {
  return normalizeText(
    [
      entity?.nombre,
      entity?.descripcion,
      entity?.categoria,
      entity?.marca,
      entity?.proveedor
    ].join(" ")
  );
}

function hasAvailableStock(producto) {
  return Number(producto?.stock || 0) > 0;
}

function encodeSvg(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function pickMatch(source, rules, fallback) {
  for (const rule of rules) {
    if (rule.keywords.some((keyword) => source.includes(keyword))) {
      return rule.kind;
    }
  }

  return fallback;
}

function getCategoryTheme(label) {
  const normalized = normalizeText(label);
  let total = 0;

  for (const char of normalized) {
    total += char.charCodeAt(0);
  }

  return COLOR_THEMES[total % COLOR_THEMES.length];
}

function getCategoryPreviewKeywords(items) {
  const labels = [];
  const seen = new Set();

  for (const item of items) {
    const candidates = [
      titleCase(String(item.nombre || "").split(/\s+/).slice(0, 3).join(" "))
    ].filter(Boolean);

    for (const candidate of candidates) {
      const normalized = normalizeText(candidate);

      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        labels.push(candidate);
      }

      if (labels.length === 8) {
        return labels;
      }
    }
  }

  return labels;
}

function buildCategoryIconSvg(kind, label, theme) {
  const [from] = theme;
  const labelChar = titleCase(label).charAt(0) || "P";

  if (kind === "palette") {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
        <circle cx="120" cy="120" r="108" fill="${from}"/>
        <circle cx="120" cy="120" r="108" fill="rgba(255,255,255,0.08)"/>
        <path d="M122 54c-34 0-62 27-62 61 0 18 13 34 31 34h12c7 0 12 5 12 12 0 14 11 25 25 25 34 0 62-28 62-64 0-38-31-68-80-68Z" fill="#f6d365"/>
        <circle cx="94" cy="93" r="10" fill="#ff7a59"/>
        <circle cx="119" cy="79" r="9" fill="#5ec0ff"/>
        <circle cx="145" cy="100" r="8" fill="#9be564"/>
        <circle cx="111" cy="128" r="10" fill="#f18fcd"/>
        <circle cx="145" cy="140" r="16" fill="#0b2545"/>
      </svg>
    `;
  }

  if (kind === "monitor") {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
        <circle cx="120" cy="120" r="108" fill="${from}"/>
        <rect x="53" y="70" width="106" height="70" rx="10" fill="#f5fbff"/>
        <rect x="63" y="80" width="86" height="50" rx="6" fill="#76c9ff"/>
        <rect x="168" y="74" width="25" height="86" rx="6" fill="#f5fbff"/>
        <rect x="96" y="155" width="48" height="9" rx="4.5" fill="#d4ebff"/>
      </svg>
    `;
  }

  if (kind === "pencil") {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
        <circle cx="120" cy="120" r="108" fill="${from}"/>
        <g transform="translate(122 118) rotate(-38) translate(-122 -118)">
          <rect x="72" y="101" width="94" height="30" rx="15" fill="#f7f4ea"/>
          <rect x="58" y="101" width="20" height="30" rx="10" fill="#ffb703"/>
          <rect x="78" y="101" width="18" height="30" rx="9" fill="#5ec0ff"/>
          <path d="M166 101h18l18 15-18 15h-18Z" fill="#0b2545"/>
          <path d="M184 101h10l16 15-16 15h-10l10-15Z" fill="#ffd7a8"/>
        </g>
      </svg>
    `;
  }

  if (kind === "box") {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
        <circle cx="120" cy="120" r="108" fill="${from}"/>
        <path d="M74 88 120 62l46 26-46 26Z" fill="#f7c45c"/>
        <path d="M74 88v64l46 26v-64Z" fill="#d6932f"/>
        <path d="M166 88v64l-46 26v-64Z" fill="#f7a531"/>
      </svg>
    `;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
      <circle cx="120" cy="120" r="108" fill="${from}"/>
      <g transform="translate(52 56)">
        <rect x="0" y="16" width="36" height="100" rx="8" fill="#f7a531"/>
        <rect x="44" y="8" width="36" height="108" rx="8" fill="#ffcb77"/>
        <rect x="88" y="0" width="36" height="116" rx="8" fill="#f7a531"/>
        <rect x="8" y="34" width="20" height="54" rx="4" fill="#173b67"/>
        <rect x="52" y="26" width="20" height="56" rx="4" fill="#173b67"/>
        <rect x="96" y="18" width="20" height="58" rx="4" fill="#173b67"/>
      </g>
      <text x="120" y="214" text-anchor="middle" font-family="Arial" font-size="38" font-weight="700" fill="#f5fbff">${labelChar}</text>
    </svg>
  `;
}

function buildProductSvg(kind, label, theme) {
  const [top, bottom] = theme;
  const base = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 260">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${top}"/>
          <stop offset="100%" stop-color="${bottom}"/>
        </linearGradient>
      </defs>
      <rect width="340" height="260" rx="34" fill="url(#g)"/>
      <circle cx="278" cy="42" r="52" fill="rgba(255,255,255,0.06)"/>
      <circle cx="54" cy="216" r="70" fill="rgba(255,255,255,0.04)"/>
  `;

  let art = "";

  if (kind === "paint") {
    art = `
      <ellipse cx="155" cy="128" rx="72" ry="58" fill="#f6d365"/>
      <circle cx="125" cy="109" r="11" fill="#ff7a59"/>
      <circle cx="152" cy="92" r="9" fill="#5ec0ff"/>
      <circle cx="182" cy="114" r="8" fill="#9be564"/>
      <circle cx="145" cy="137" r="10" fill="#f18fcd"/>
      <circle cx="182" cy="144" r="15" fill="#0b2545"/>
      <path d="m209 92 34 72c2 5-4 10-9 7l-18-10-11 17c-3 4-10 3-11-3l13-83c1-6 10-7 13 0Z" fill="#ffb703"/>
    `;
  } else if (kind === "tech") {
    art = `
      <rect x="74" y="82" width="118" height="78" rx="10" fill="#f5fbff"/>
      <rect x="84" y="92" width="98" height="58" rx="6" fill="#76c9ff"/>
      <rect x="206" y="86" width="28" height="100" rx="7" fill="#f5fbff"/>
      <rect x="212" y="98" width="16" height="18" rx="3" fill="#9bd6ff"/>
      <rect x="212" y="124" width="16" height="46" rx="3" fill="#9bd6ff"/>
      <rect x="124" y="164" width="22" height="10" rx="4" fill="#f5fbff"/>
      <rect x="110" y="174" width="50" height="9" rx="4.5" fill="#d4ebff"/>
    `;
  } else if (kind === "notebook") {
    art = `
      <rect x="98" y="56" width="132" height="156" rx="18" fill="#f5fbff"/>
      <rect x="88" y="56" width="20" height="156" rx="10" fill="#9bd6ff"/>
      <circle cx="103" cy="84" r="4" fill="#173b67"/>
      <circle cx="103" cy="110" r="4" fill="#173b67"/>
      <circle cx="103" cy="136" r="4" fill="#173b67"/>
      <circle cx="103" cy="162" r="4" fill="#173b67"/>
      <rect x="120" y="84" width="84" height="10" rx="5" fill="#dcecff"/>
      <rect x="120" y="108" width="72" height="8" rx="4" fill="#dcecff"/>
      <rect x="120" y="130" width="80" height="8" rx="4" fill="#dcecff"/>
      <rect x="120" y="152" width="58" height="8" rx="4" fill="#dcecff"/>
    `;
  } else if (kind === "pencil") {
    art = `
      <g transform="translate(170 132) rotate(-36) translate(-170 -132)">
        <rect x="104" y="116" width="110" height="34" rx="17" fill="#f7f4ea"/>
        <rect x="88" y="116" width="22" height="34" rx="11" fill="#ffb703"/>
        <rect x="110" y="116" width="20" height="34" rx="10" fill="#5ec0ff"/>
        <path d="M214 116h22l22 17-22 17h-22Z" fill="#0b2545"/>
        <path d="M236 116h12l18 17-18 17h-12l12-17Z" fill="#ffd7a8"/>
      </g>
    `;
  } else if (kind === "markers") {
    art = `
      <g transform="translate(92 54)">
        <rect x="0" y="38" width="52" height="142" rx="20" fill="#f2a6c6" transform="rotate(-10 26 109)"/>
        <rect x="56" y="18" width="52" height="162" rx="20" fill="#7dd3d8" transform="rotate(6 82 99)"/>
        <rect x="114" y="38" width="52" height="142" rx="20" fill="#ffe27a" transform="rotate(12 140 109)"/>
      </g>
    `;
  } else if (kind === "bag") {
    art = `
      <path d="M111 98c0-26 21-47 47-47s47 21 47 47h-20c0-15-12-27-27-27s-27 12-27 27Z" fill="#ffcb77"/>
      <rect x="96" y="95" width="126" height="118" rx="28" fill="#9bd6ff"/>
      <rect x="120" y="118" width="78" height="56" rx="18" fill="#173b67"/>
      <rect x="142" y="135" width="34" height="22" rx="8" fill="#f5fbff"/>
    `;
  } else if (kind === "calculator") {
    art = `
      <rect x="113" y="56" width="116" height="156" rx="24" fill="#f5fbff"/>
      <rect x="129" y="74" width="84" height="34" rx="10" fill="#9bd6ff"/>
      <g fill="#173b67">
        <rect x="129" y="124" width="20" height="20" rx="6"/>
        <rect x="161" y="124" width="20" height="20" rx="6"/>
        <rect x="193" y="124" width="20" height="20" rx="6"/>
        <rect x="129" y="156" width="20" height="20" rx="6"/>
        <rect x="161" y="156" width="20" height="20" rx="6"/>
        <rect x="193" y="156" width="20" height="20" rx="6"/>
      </g>
    `;
  } else if (kind === "box") {
    art = `
      <path d="M104 86 170 54l66 32-66 32Z" fill="#f7c45c"/>
      <path d="M104 86v86l66 34v-88Z" fill="#d6932f"/>
      <path d="M236 86v86l-66 34v-88Z" fill="#f7a531"/>
      <rect x="140" y="112" width="22" height="58" rx="8" fill="rgba(255,255,255,0.22)"/>
    `;
  } else {
    art = `
      <rect x="92" y="78" width="54" height="132" rx="14" fill="#f7a531"/>
      <rect x="152" y="66" width="54" height="144" rx="14" fill="#ffcb77"/>
      <rect x="212" y="54" width="54" height="156" rx="14" fill="#f7a531"/>
      <rect x="104" y="112" width="28" height="66" rx="6" fill="#173b67"/>
      <rect x="164" y="100" width="28" height="72" rx="6" fill="#173b67"/>
      <rect x="224" y="88" width="28" height="78" rx="6" fill="#173b67"/>
    `;
  }

  return `
    ${base}
      ${art}
      <rect x="28" y="198" width="176" height="34" rx="17" fill="rgba(255,255,255,0.14)"/>
      <text x="44" y="220" font-family="Arial" font-size="18" fill="#f5fbff">${label}</text>
    </svg>
  `;
}

export function buildCategoryShowcase(categories, products) {
  const knownIds = new Set(categories.map((item) => Number(item.id)));
  const availableProducts = products.filter(hasAvailableStock);
  const mapped = categories
    .map((category) => {
      const items = availableProducts.filter(
        (producto) => Number(producto.categoria_id) === Number(category.id)
      );
      const totalProductos = Number(category.total_productos || items.length || 0);

      return {
        ...category,
        label: titleCase(category.nombre),
        description: category.descripcion || "Categoria del catalogo PapperTech.",
        total_productos: totalProductos,
        items,
        previewLabels: getCategoryPreviewKeywords(items)
      };
    })
    .filter((category) => category.total_productos > 0);

  const uncategorizedItems = availableProducts.filter(
    (producto) => !knownIds.has(Number(producto.categoria_id))
  );

  if (uncategorizedItems.length > 0) {
    mapped.push({
      id: "sin-categoria",
      nombre: "Sin categoria",
      label: "Sin categoria",
      descripcion: "Productos activos que aun no tienen una categoria formal.",
      total_productos: uncategorizedItems.length,
      items: uncategorizedItems,
      previewLabels: getCategoryPreviewKeywords(uncategorizedItems)
    });
  }

  return mapped.sort((first, second) =>
    first.label.localeCompare(second.label, "es", { sensitivity: "base" })
  );
}

export function getCategoryIconSource(category) {
  const label = category?.nombre || category?.label || "Categoria";
  const source = normalizeText([label, category?.descripcion].join(" "));
  const theme = getCategoryTheme(label);
  const kind = pickMatch(source, CATEGORY_ICON_RULES, "binders");

  return encodeSvg(buildCategoryIconSvg(kind, label, theme));
}

export function getProductImageSource(producto) {
  if (producto?.imagen_url) {
    return producto.imagen_url;
  }

  const source = buildSource(producto);
  const kind = pickMatch(source, PRODUCT_VISUAL_RULES, "binders");
  const theme = getCategoryTheme(producto?.categoria || producto?.nombre || "PapperTech");
  const label = titleCase(String(producto?.nombre || "PapperTech").split(/\s+/).slice(0, 2).join(" "));

  return encodeSvg(buildProductSvg(kind, label, theme));
}

export function getProductCategoryLabel(producto) {
  return titleCase(producto?.categoria || "Sin categoria");
}
