/* sandbox-modern-v2 renderer — adds outlet wordmarks + extended press images */

const $ = (s, r = document) => r.querySelector(s);
const make = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const makeHTML = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

/* HTML-escape text and bold any "Lopez-Lopez" surname mentions.
   Used everywhere an author / co-investigator / talk credit string is rendered. */
const escapeHTML = s => (s == null ? "" : String(s))
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");
const highlightSelf = s => escapeHTML(s).replace(/Lopez-Lopez/g, "<strong>Lopez-Lopez</strong>");

/* All eight outlets now have hero images */
const PRESS_THUMBS = {
  "Scientific American":   "assets/media/sciam.jpg",
  "The Verge":             "assets/media/verge.jpg",
  "El País — Ideas":       "assets/media/elpais.jpg",
  "El País — Tecnología":  "assets/media/elpais-tec.jpg",
  "ABC Cultural":          "assets/media/abc.jpg",
  "DIE ZEIT":              "assets/media/zeit.jpg",
  "Der Spiegel":           "assets/media/spiegel.jpg",
  "Forbes":                "assets/media/forbes.jpg",
};

/* Outlet → wordmark CSS slug. Wordmarks are styled in CSS via these classes. */
const OUTLET_WORDMARK = {
  "Scientific American":   { cls: "wm wm-sciam",   text: "Scientific American" },
  "The Verge":             { cls: "wm wm-verge",   text: "The Verge" },
  "El País — Ideas":       { cls: "wm wm-elpais",  text: "EL PAÍS" },
  "El País — Tecnología":  { cls: "wm wm-elpais",  text: "EL PAÍS" },
  "ABC Cultural":          { cls: "wm wm-abc",     text: "ABC" },
  "DIE ZEIT":              { cls: "wm wm-zeit",    text: "DIE ZEIT" },
  "Der Spiegel":           { cls: "wm wm-spiegel", text: "DER SPIEGEL" },
  "Forbes":                { cls: "wm wm-forbes",  text: "Forbes" },
};

const TYPE_TAG = {
  "journal": "Journal",
  "under review": "Under review",
  "preprint": "Preprint",
  "in prep.": "In prep.",
  "handbook": "Handbook",
  "conf. proc.": "Conf. proc.",
};
const formatType = t => TYPE_TAG[(t || "").toLowerCase()] || t;

/* Hero Königsberg journey — runs immediately, independent of content.json */
renderHeroMorph();

fetch("content.json?v=15").then(r => r.json()).then(data => {
  renderWork(data.publications);
  renderAllWork(data.publications);
  renderPress(data.media);
  renderPressWall(data.media);
  renderTrustStrip(data.media);
  renderTalks(data.talks);
  renderAllTalks(data.talks);
  renderVenn(data.venn, data.publications);
  renderGrants(data.grants);
  renderWorkshops(data.workshops);
  wireTrajectoryScroll();
});

/* =========================================================
   TRAJECTORY · scroll-tied bio stage. Each li.tj-stop carries a
   <template class="tj-bio"> with the bio HTML that the right-hand
   stage swaps in when the stop is the most-visible one in the viewport.
   The default stage content is the path overview; we restore it when
   the trajectory section leaves the viewport entirely.
   ========================================================= */
function wireTrajectoryScroll() {
  const stage   = document.getElementById("tj-bio-stage");
  const section = document.getElementById("trajectory");
  if (!stage || !section) return;
  const stops = Array.from(document.querySelectorAll("#trajectory .tj-stop"));
  if (!stops.length) return;

  /* Capture the default stage content so we can restore it. */
  const defaultHTML = stage.innerHTML;

  /* Pre-extract bio HTML per stop (skip stops without a <template>). */
  const bios = new Map();
  stops.forEach(stop => {
    const tpl = stop.querySelector("template.tj-bio");
    if (tpl) bios.set(stop, tpl.innerHTML);
  });

  /* Reading line: where on the viewport a stop's TOP edge "activates".
     Lower value = earlier switch to the next bio = more dwell time per bio. */
  const READING_FRACTION = 0.22;

  let activeStop = null;
  let pending = false;

  const setStage = html => {
    if (stage.innerHTML === html) return;
    stage.classList.add("is-fading");
    setTimeout(() => {
      stage.innerHTML = html;
      stage.classList.remove("is-fading");
    }, 110);
  };

  /* Pick the BOTTOM-MOST stop whose top edge has crossed the reading line.
     Stops are iterated in DOM order (== visual top→bottom), so this gives
     strictly monotonic progression with scroll: once you've scrolled past a
     stop's top, that stop is "current" until the NEXT stop's top crosses,
     too. No flipping back and forth between competing-ratio neighbours. */
  const update = () => {
    pending = false;

    const sectionRect = section.getBoundingClientRect();
    const vh = window.innerHeight;

    /* Section out of view → restore default. */
    if (sectionRect.bottom < 0 || sectionRect.top > vh) {
      if (activeStop !== null) {
        activeStop = null;
        setStage(defaultHTML);
      }
      return;
    }

    const readingLine = vh * READING_FRACTION;
    let best = null;
    for (const stop of stops) {
      const r = stop.getBoundingClientRect();
      if (r.top <= readingLine) best = stop;
      else break;  /* stops below the line are below in the page; stop scanning. */
    }

    if (!best) {
      /* Above all stops (top of section in view) — show default. */
      if (activeStop !== null) {
        activeStop = null;
        setStage(defaultHTML);
      }
      return;
    }

    if (best === activeStop) return;
    activeStop = best;
    setStage(bios.get(best) || defaultHTML);
  };

  const onScroll = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(update);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
}

/* =========================================================
   VENN — render papers as colour-coded dots, tooltips on hover.
   Hollow ring = type "in prep."; everything else gets a solid fill.
   ========================================================= */
function formatCitation(p) {
  const venue = p.venue || "Manuscript in preparation";
  /* Returns HTML — author surname bolded, everything else escaped. */
  return `${highlightSelf(p.authors)} (${p.year}). ${escapeHTML(p.title)}. ${escapeHTML(venue)}.`;
}
/* Plain-text citation for aria-label fallback */
function formatCitationPlain(p) {
  const venue = p.venue || "Manuscript in preparation";
  return `${p.authors} (${p.year}). ${p.title}. ${venue}.`;
}

/* Auto-placement offsets when (x,y) is omitted: small clusters around region anchor */
const VENN_AUTO_OFFSETS = [
  [0, 0], [-22, 0], [22, 0], [0, -22], [0, 22],
  [-22, -22], [22, -22], [-22, 22], [22, 22], [0, -44], [0, 44]
];

function renderVenn(venn, publications) {
  if (!venn) return;
  const svg = document.querySelector(".venn");
  if (!svg) return;
  const NS = "http://www.w3.org/2000/svg";
  const pubById = Object.fromEntries(publications.map(p => [p.id, p]));

  /* Replace any existing papers group */
  const old = svg.querySelector("#venn-papers");
  if (old) old.remove();
  const g = document.createElementNS(NS, "g");
  g.id = "venn-papers";

  /* Support both legacy flat papers[] and new regions{} structure */
  const placements = [];
  if (venn.regions) {
    Object.entries(venn.regions).forEach(([regionName, region]) => {
      const anchor = region._anchorXY || [300, 300];
      const papers = region.papers || [];
      papers.forEach((spec, idx) => {
        let x = spec.x, y = spec.y;
        if (x == null || y == null) {
          const off = VENN_AUTO_OFFSETS[idx] || [0, 0];
          x = anchor[0] + off[0];
          y = anchor[1] + off[1];
        }
        placements.push({ ...spec, region: regionName, x, y });
      });
    });
  } else if (Array.isArray(venn.papers)) {
    venn.papers.forEach(p => placements.push(p));
  }

  /* Two markers: solid disc (everything published or under review) vs
     hollow ring (in preparation). */
  placements.forEach(spec => {
    const pub = pubById[spec.id];
    if (!pub) return;
    const c = document.createElementNS(NS, "circle");
    let cls = "dot";
    if (pub.type === "in prep.") cls += " dot-prep";
    c.setAttribute("class", cls);
    c.setAttribute("cx", spec.x);
    c.setAttribute("cy", spec.y);
    c.setAttribute("r", spec.r || 6);
    c.setAttribute("aria-label", formatCitationPlain(pub));
    c.dataset.cite = formatCitation(pub);
    if (pub.url) c.dataset.url = pub.url;
    g.appendChild(c);
  });

  /* Insert dots BEFORE the legend group so legend stays on top */
  const legend = svg.querySelector(".venn-legend") || svg.lastElementChild;
  svg.insertBefore(g, legend);

  wireVennTooltips();
}

function wireVennTooltips() {
  const tooltip = document.getElementById("venn-tooltip");
  if (!tooltip) return;
  const dots = document.querySelectorAll(".venn .dot[data-cite]");
  dots.forEach(d => {
    d.addEventListener("mouseenter", () => {
      tooltip.innerHTML = d.dataset.cite;
      tooltip.hidden = false;
      requestAnimationFrame(() => tooltip.setAttribute("data-show", "1"));
    });
    d.addEventListener("mousemove", e => {
      const pad = 14;
      let x = e.clientX + pad;
      let y = e.clientY + pad;
      const tw = tooltip.offsetWidth;
      const th = tooltip.offsetHeight;
      if (x + tw > window.innerWidth - 8) x = e.clientX - tw - pad;
      if (y + th > window.innerHeight - 8) y = e.clientY - th - pad;
      tooltip.style.left = x + "px";
      tooltip.style.top = y + "px";
    });
    d.addEventListener("mouseleave", () => {
      tooltip.removeAttribute("data-show");
      setTimeout(() => { tooltip.hidden = true; }, 140);
    });
  });
}

/* =========================================================
   GRANTS & FUNDED PROJECTS
   ========================================================= */
function renderGrants(grants) {
  const root = document.getElementById("grants-list");
  if (!root || !grants) return;
  root.innerHTML = "";
  grants.forEach(g => {
    const li = document.createElement("li");
    const yr = make("span", "yr", g.dateLabel || `${g.start} — ${g.end}`);
    const body = make("div", "g-body");
    body.append(make("span", "g-role", g.role));
    if (g.url) {
      const a = make("a", "g-title", g.title);
      a.href = g.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      body.append(a);
    } else {
      body.append(make("span", "g-title", g.title));
    }
    if (g.titleOriginal && g.titleOriginal !== g.title) {
      body.append(make("span", "g-title-orig", `[${g.titleOriginal}]`));
    }
    if (g.funder) body.append(make("span", "g-funder", g.funder));
    if (g.pi || (g.coIs && g.coIs.length)) {
      const team = makeHTML("span", "g-team");
      const piPart = g.pi ? `PI: ${highlightSelf(g.pi)}` : "";
      const coPart = (g.coIs && g.coIs.length)
        ? "co-Is: " + g.coIs.map(c => highlightSelf(c.replace(/\s*\([^)]*\)\s*$/, ""))).join(", ")
        : "";
      team.innerHTML = [piPart, coPart].filter(Boolean).join(" · ");
      body.append(team);
    }
    if (g.summary) body.append(make("p", "g-summary", g.summary));
    li.append(yr, body);
    root.append(li);
  });
}


/* =========================================================
   ORGANISED WORKSHOPS
   ========================================================= */
function renderWorkshops(workshops) {
  const root = document.getElementById("workshops-list");
  if (!root || !workshops) return;
  root.innerHTML = "";
  workshops.forEach(w => {
    const li = document.createElement("li");
    const yr = make("span", "yr", w.date || `${w.year} · ${w.month}`);
    const body = make("div", "ws-body");
    body.append(make("span", "ws-role", w.role));
    if (w.url) {
      const a = make("a", "ws-title", w.title);
      a.href = w.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      body.append(a);
    } else {
      body.append(make("span", "ws-title", w.title));
    }
    if (w.subtitle) body.append(make("span", "ws-sub", w.subtitle));
    if (w.venue)    body.append(make("span", "ws-venue", w.venue));
    li.append(yr, body);
    root.append(li);
  });
}

/* Type → CSS modifier slug (for tile coloured corners) */
function typeSlug(t) {
  const s = (t || "").toLowerCase();
  if (s.includes("under review")) return "review";
  if (s.includes("preprint"))     return "preprint";
  if (s.includes("in prep"))      return "prep";
  if (s.includes("handbook"))     return "handbook";
  if (s.includes("conf"))         return "conf";
  return "journal";
}

function renderWork(pubs) {
  const root = $("#tiles");
  if (!root) return;
  root.innerHTML = "";

  /* Default visible: 3 featured + 3 most-cited. Rest get .tile-hidden, revealed on Show more. */
  const featured = pubs.filter(p => p.featured);
  const restSorted = pubs.filter(p => !p.featured)
    .sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return (b.cited || 0) - (a.cited || 0);
    });
  const visible = [...featured, ...restSorted.slice(0, 3)];
  const hidden  = restSorted.slice(3);
  const all = [...visible, ...hidden];

  all.forEach((p, i) => {
    const isHidden = i >= visible.length;
    const tile = make(p.url ? "a" : "div", "tile tile-" + typeSlug(p.type) + (isHidden ? " tile-hidden" : ""));
    if (p.url) {
      tile.href = p.url;
      tile.target = "_blank";
      tile.rel = "noopener noreferrer";
    }

    const head = make("div", "tile-head");
    head.append(make("span", "tile-type", formatType(p.type)));
    const meta = make("span", "tile-meta");
    meta.append(make("span", "tile-yr", String(p.year)));
    if (p.cited != null) meta.append(make("span", "tile-cited", `cited ${p.cited}`));
    head.append(meta);
    tile.append(head);

    tile.append(make("div", "tile-title", p.title));
    tile.append(makeHTML("div", "tile-au", highlightSelf(p.authors)));
    tile.append(make("div", "tile-ve", p.venue.split(",")[0].trim()));

    if (p.media && p.media.length) {
      const m = make("div", "tile-press");
      m.textContent = `Press · ${p.media.join(", ")}`;
      tile.append(m);
    }

    root.append(tile);
  });

  /* Show more button — only render if there are hidden tiles */
  const oldRow = document.querySelector(".show-more-row");
  if (oldRow) oldRow.remove();
  if (hidden.length) {
    const row = make("div", "show-more-row");
    const btn = make("button", "show-more", `Show all (${all.length})`);
    btn.type = "button";
    btn.addEventListener("click", () => {
      const expanded = root.classList.toggle("tiles-expanded");
      btn.textContent = expanded ? `Show fewer` : `Show all (${all.length})`;
    });
    row.append(btn);
    root.parentElement.insertBefore(row, root.nextSibling);
  }
}

function parseMediaText(text) {
  const m = text.match(/^[\"“](.+?)[\"”]\s*\(([^)]+)\)\s*[-—]?\s*(.*)$/);
  if (!m) return { headline: text, date: "", note: "" };
  return { headline: m[1], date: m[2], note: m[3] };
}

function makeWordmark(outlet) {
  const w = OUTLET_WORDMARK[outlet];
  if (!w) return make("span", "wm wm-default", outlet);
  return make("span", w.cls, w.text);
}

function renderPress(media) {
  const root = $("#press-grid");
  if (!root) return;
  root.innerHTML = "";

  const ordered = [...media].sort((a, b) => {
    const aHas = !!PRESS_THUMBS[a.outlet];
    const bHas = !!PRESS_THUMBS[b.outlet];
    if (aHas !== bHas) return aHas ? -1 : 1;
    return 0;
  });

  ordered.forEach(m => {
    const item = make("article", "press-item");
    const parsed = parseMediaText(m.text);

    /* Wordmark above the image (always shown) */
    const wm = makeWordmark(m.outlet);
    item.append(wm);

    const thumb = make("div", "thumb");
    const src = PRESS_THUMBS[m.outlet];
    if (src) {
      const img = make("img");
      img.src = src;
      img.alt = m.outlet;
      thumb.append(img);
    } else {
      thumb.classList.add("fallback");
      thumb.textContent = m.outlet.split(/[\s—-]/)[0];
    }
    item.append(thumb);

    if (parsed.date) item.append(make("div", "date", parsed.date));

    const h3 = make("h3");
    if (m.url) {
      const a = make("a", null, parsed.headline);
      a.href = m.url; a.target = "_blank"; a.rel = "noopener noreferrer";
      h3.append(a);
    } else h3.textContent = parsed.headline;
    item.append(h3);

    root.append(item);
  });
}

/* All publications — compact list rendered inside <details> */
function renderAllWork(pubs) {
  const root = document.getElementById("all-bib");
  const count = document.getElementById("all-count");
  if (!root) return;
  root.innerHTML = "";
  if (count) count.textContent = `(${pubs.length})`;
  // Sort by year desc, then by featured first within year
  const ordered = [...pubs].sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
  });
  ordered.forEach(p => {
    const li = document.createElement("li");
    li.className = "bib-row";
    const yr = document.createElement("span");
    yr.className = "bib-yr";
    yr.textContent = p.year;
    const ti = document.createElement("span");
    ti.className = "bib-ti";
    if (p.url) {
      const a = document.createElement("a");
      a.href = p.url; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = p.title;
      ti.append(a);
    } else {
      ti.textContent = p.title;
    }
    const au = document.createElement("span");
    au.className = "bib-au";
    au.innerHTML = highlightSelf(p.authors);
    const ve = document.createElement("span");
    ve.className = "bib-ve";
    ve.textContent = p.venue;
    const ty = document.createElement("span");
    ty.className = "bib-ty";
    ty.textContent = formatType(p.type);
    li.append(yr, ti, au, ve, ty);
    root.append(li);
  });
}

/* All talks — compact list rendered inside <details>, after the first 5 */
function renderAllTalks(talks) {
  const root = document.getElementById("all-talks");
  const count = document.getElementById("talks-count");
  if (!root) return;
  root.innerHTML = "";
  const rest = talks.slice(5);
  if (count) count.textContent = `(${talks.length})`;
  rest.forEach(t => {
    const li = document.createElement("li");
    const yr = document.createElement("div");
    yr.className = "yr";
    yr.textContent = String(t.year);
    li.append(yr);
    const txt = (t.text || "").replace(/^\d{4}\s*[-–]\s*/, "");
    const body = document.createElement("div");
    body.innerHTML = highlightSelf(txt);
    li.append(body);
    root.append(li);
  });
}

/* Trust strip — outlet wordmarks under hero, no header beyond a tiny "Featured in" label */
function renderTrustStrip(media) {
  const root = document.getElementById("trust-strip");
  if (!root) return;
  // Keep the existing label, append wordmarks
  const seen = new Set();
  media.forEach(m => {
    const key = m.outlet === "El País — Ideas" || m.outlet === "El País — Tecnología" ? "El País" : m.outlet;
    if (seen.has(key)) return;
    seen.add(key);
    root.append(makeWordmark(m.outlet));
  });
}

/* Render a thin "as featured in" wordmark wall above the press grid */
function renderPressWall(media) {
  const root = $("#press-wall");
  if (!root) return;
  root.innerHTML = "";

  // Unique outlets, in order of first appearance
  const seen = new Set();
  const uniq = [];
  media.forEach(m => {
    const key = m.outlet === "El País — Ideas" || m.outlet === "El País — Tecnología" ? "El País" : m.outlet;
    if (seen.has(key)) return;
    seen.add(key);
    uniq.push(m.outlet);
  });

  uniq.forEach(outlet => {
    const w = OUTLET_WORDMARK[outlet];
    if (!w) return;
    root.append(makeWordmark(outlet));
  });
}

function renderTalks(talks) {
  const root = $("#talks-list");
  if (!root) return;
  root.innerHTML = "";
  talks.slice(0, 5).forEach(t => {
    const li = make("li");
    li.append(make("div", "yr", String(t.year)));
    const txt = (t.text || "").replace(/^\d{4}\s*[-–]\s*/, "");
    li.append(makeHTML("div", null, highlightSelf(txt)));
    root.append(li);
  });
}


/* =============================================================================
   HERO MORPH — the Königsberg journey
   Portrait (sampled from assets/pic.jpg) → Gaussian cloud → Königsberg, 1736
   (sampled from assets/koenigsberg.png) → Euler's four-node graph with seven
   edges → portrait. All five summary statistics (x̄, ȳ, σ_x, σ_y, ρ) are
   locked across every state via a Cholesky-coloured affine transform.
   Three-tone Wes-Anderson palette: navy + rust + warm-skin.
   ============================================================================= */
function renderHeroMorph() {
  const canvas = document.getElementById("hero-morph");
  if (!canvas) return;
  const statsEl = document.getElementById("hero-morph-stats");

  const W = 800, H = 600;
  const N_DOTS = 5000;
  const RELAX = 4;
  const SIZE_MUL = 1.20;        /* coarser dots */
  const INSET = 0.78;           /* shrink all dots toward centre so locked
                                   targets (esp. graph nodes + their curved
                                   edges + labels) stay clear of the border. */

  const COL = {
    paper: "#ffffff",
    navy:  "#1a3554",
    rust:  "#983715",
    skin:  "#b87a4f"
  };

  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  /* placeholder noise so the area doesn't read as empty during build */
  ctx.fillStyle = COL.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(26,53,84,0.12)";
  for (let i = 0; i < 900; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Run the heavy build on the next frame, then animate. */
  Promise.all([
    loadHeroImageData("assets/pic.jpg",         W, H, true),
    loadHeroImageData("assets/koenigsberg.png", W, H, false)
  ]).then(([photo, kData]) => {
    requestAnimationFrame(() => buildAndAnimate(photo, kData));
  });

  /* ---------- helpers ---------- */
  function loadHeroImageData(src, w, h, fillCover) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const off = document.createElement("canvas");
        off.width = w; off.height = h;
        const c = off.getContext("2d");
        c.fillStyle = "#fff";
        c.fillRect(0, 0, w, h);
        if (fillCover) {
          c.drawImage(img, 0, 0, w, h);
        } else {
          /* fit-and-centre, keeping aspect — for the engraving */
          const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
          const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
          c.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        }
        resolve(c.getImageData(0, 0, w, h));
      };
      img.src = src;
    });
  }

  function buildWeights(data) {
    const Np = W * H;
    const arr = new Float32Array(Np);
    for (let i = 0; i < Np; i++) {
      const r = data.data[i*4], g = data.data[i*4+1], b = data.data[i*4+2];
      const lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255;
      arr[i] = Math.pow(1 - lum, 1.4);
    }
    return arr;
  }

  function samplePoints(weights, N) {
    const cellSize = Math.max(2, Math.round(Math.sqrt((W * H) / (N * 1.6))));
    const gw = Math.ceil(W / cellSize), gh = Math.ceil(H / cellSize);
    const grid = Array.from({ length: gw * gh }, () => []);
    const accepted = [];
    let attempts = 0;
    const maxAttempts = N * 30;
    while (accepted.length < N && attempts < maxAttempts) {
      attempts++;
      const x = Math.random() * W, y = Math.random() * H;
      const ix = Math.floor(x), iy = Math.floor(y);
      const w = weights[iy * W + ix];
      if (w < 0.04) continue;
      if (Math.random() > 0.15 + 0.85 * w) continue;
      const minDist = cellSize * (0.55 + (1 - w) * 0.55);
      const minDistSq = minDist * minDist;
      const cx = Math.floor(x / cellSize), cy = Math.floor(y / cellSize);
      let tooClose = false;
      for (let oy = -1; oy <= 1 && !tooClose; oy++) {
        for (let ox = -1; ox <= 1 && !tooClose; ox++) {
          const ncx = cx + ox, ncy = cy + oy;
          if (ncx < 0 || ncy < 0 || ncx >= gw || ncy >= gh) continue;
          for (const id of grid[ncy * gw + ncx]) {
            const dx = accepted[id].x - x, dy = accepted[id].y - y;
            if (dx * dx + dy * dy < minDistSq) { tooClose = true; break; }
          }
        }
      }
      if (tooClose) continue;
      const dot = { x, y, baseX: x, baseY: y, w, r: 0, phase: Math.random() * Math.PI * 2 };
      grid[cy * gw + cx].push(accepted.length);
      accepted.push(dot);
    }
    return accepted;
  }

  function relax(dots, weights, iterations) {
    const cellSize = 12;
    const gw = Math.ceil(W / cellSize), gh = Math.ceil(H / cellSize);
    for (let iter = 0; iter < iterations; iter++) {
      const grid = Array.from({ length: gw * gh }, () => []);
      for (let i = 0; i < dots.length; i++) {
        const cx = Math.min(gw-1, Math.max(0, Math.floor(dots[i].x / cellSize)));
        const cy = Math.min(gh-1, Math.max(0, Math.floor(dots[i].y / cellSize)));
        grid[cy * gw + cx].push(i);
      }
      const cents = new Float64Array(dots.length * 3);
      for (let y = 0; y < H; y += 2) {
        const cy = Math.min(gh-1, Math.max(0, Math.floor(y / cellSize)));
        for (let x = 0; x < W; x += 2) {
          const w = weights[y * W + x];
          if (w < 0.04) continue;
          const cx = Math.min(gw-1, Math.max(0, Math.floor(x / cellSize)));
          let bestId = -1, bestD = Infinity;
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const ncx = cx + ox, ncy = cy + oy;
              if (ncx < 0 || ncy < 0 || ncx >= gw || ncy >= gh) continue;
              for (const id of grid[ncy * gw + ncx]) {
                const dx = dots[id].x - x, dy = dots[id].y - y;
                const d = dx*dx + dy*dy;
                if (d < bestD) { bestD = d; bestId = id; }
              }
            }
          }
          if (bestId >= 0) {
            cents[bestId*3]   += x * w;
            cents[bestId*3+1] += y * w;
            cents[bestId*3+2] += w;
          }
        }
      }
      for (let i = 0; i < dots.length; i++) {
        const sw = cents[i*3+2];
        if (sw < 0.05) continue;
        const cx = cents[i*3] / sw, cy = cents[i*3+1] / sw;
        dots[i].x += (cx - dots[i].x) * 0.7;
        dots[i].y += (cy - dots[i].y) * 0.7;
        dots[i].baseX = dots[i].x;
        dots[i].baseY = dots[i].y;
        const ix = Math.min(W-1, Math.max(0, Math.floor(dots[i].x)));
        const iy = Math.min(H-1, Math.max(0, Math.floor(dots[i].y)));
        dots[i].w = weights[iy*W + ix];
      }
    }
  }

  /* Three-tone navy / rust / warm-skin by underlying photo pixel */
  function assignThreeTone(dots, photoData) {
    for (const d of dots) {
      const ix = Math.min(W-1, Math.max(0, Math.floor(d.baseX)));
      const iy = Math.min(H-1, Math.max(0, Math.floor(d.baseY)));
      const i = (iy * W + ix) * 4;
      const r = photoData.data[i], g = photoData.data[i+1], b = photoData.data[i+2];
      const warm = r - b;
      if (warm > 12 && warm < 70 && g > b + 20)      d.colour = COL.skin;
      else if (warm > 8)                              d.colour = COL.rust;
      else                                             d.colour = COL.navy;
    }
  }

  /* ---------- stats helpers ---------- */
  function statsArr(positions) {
    const N = positions.length / 2;
    let mx = 0, my = 0;
    for (let i = 0; i < N; i++) { mx += positions[i*2]; my += positions[i*2+1]; }
    mx /= N; my /= N;
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < N; i++) {
      const dx = positions[i*2] - mx, dy = positions[i*2+1] - my;
      sxx += dx*dx; syy += dy*dy; sxy += dx*dy;
    }
    const sx = Math.sqrt(sxx / N), sy = Math.sqrt(syy / N);
    return { mx, my, sx, sy, rho: sxy / (N * sx * sy + 1e-9) };
  }
  function statsDots(dots) {
    const arr = new Float32Array(dots.length * 2);
    for (let i = 0; i < dots.length; i++) { arr[i*2] = dots[i].baseX; arr[i*2+1] = dots[i].baseY; }
    return statsArr(arr);
  }
  function chol(sx, sy, rho) {
    return [[sx, 0], [rho * sy, sy * Math.sqrt(Math.max(1e-6, 1 - rho*rho))]];
  }
  function invLT(L) {
    const a = L[0][0], b = L[1][0], c = L[1][1];
    return [[1/a, 0], [-b / (a*c), 1/c]];
  }
  function mm(A, B) {
    return [
      [A[0][0]*B[0][0] + A[0][1]*B[1][0], A[0][0]*B[0][1] + A[0][1]*B[1][1]],
      [A[1][0]*B[0][0] + A[1][1]*B[1][0], A[1][0]*B[0][1] + A[1][1]*B[1][1]]
    ];
  }
  function lockToStats(positions, dst) {
    const src = statsArr(positions);
    const Ls = chol(src.sx, src.sy, src.rho);
    const Ld = chol(dst.sx, dst.sy, dst.rho);
    const T = mm(Ld, invLT(Ls));
    const N = positions.length / 2;
    const out = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = positions[i*2] - src.mx;
      const y = positions[i*2+1] - src.my;
      out[i*2]   = T[0][0]*x + T[0][1]*y + dst.mx;
      out[i*2+1] = T[1][0]*x + T[1][1]*y + dst.my;
    }
    return out;
  }
  /* Mean + isotropic-scale lock: keeps the source's natural aspect intact.
     Used for the Königsberg engraving so the figure stays recognisable. */
  function lockMeanIsotropic(positions, dst) {
    const src = statsArr(positions);
    const sourceScale = Math.sqrt(src.sx * src.sy);
    const targetScale = Math.sqrt(dst.sx * dst.sy);
    const scale = (sourceScale > 1e-6) ? (targetScale / sourceScale) : 1;
    const N = positions.length / 2;
    const out = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      out[i*2]   = (positions[i*2]   - src.mx) * scale + dst.mx;
      out[i*2+1] = (positions[i*2+1] - src.my) * scale + dst.my;
    }
    return out;
  }

  /* ---------- target shapes ---------- */
  function gaussianRaw(N) {
    const out = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const u1 = Math.random(), u2 = Math.random();
      const u3 = Math.random(), u4 = Math.random();
      out[i*2]   = Math.sqrt(-2*Math.log(u1)) * Math.cos(2*Math.PI*u2);
      out[i*2+1] = Math.sqrt(-2*Math.log(u3)) * Math.cos(2*Math.PI*u4);
    }
    return out;
  }
  function konigsbergRaw(N, kData) {
    const w = kData.width, h = kData.height;
    const pts = new Float32Array(N * 2);
    let idx = 0, attempts = 0;
    const maxAttempts = N * 80;
    while (idx < N && attempts < maxAttempts) {
      attempts++;
      const x = Math.random() * w, y = Math.random() * h;
      const i = (Math.floor(y) * w + Math.floor(x)) * 4;
      const r = kData.data[i], g = kData.data[i+1], b = kData.data[i+2];
      const lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255;
      const dk = Math.pow(1 - lum, 1.6);
      if (dk < 0.10) continue;
      if (Math.random() < dk * 0.90 + 0.05) {
        pts[idx*2]   = (x - w/2) / (w/2) * 0.95;
        pts[idx*2+1] = (y - h/2) / (h/2) * 0.85;
        idx++;
      }
    }
    while (idx < N) {
      const seed = Math.floor(Math.random() * Math.max(1, idx));
      pts[idx*2]   = pts[seed*2]   + (Math.random()-0.5) * 0.05;
      pts[idx*2+1] = pts[seed*2+1] + (Math.random()-0.5) * 0.05;
      idx++;
    }
    return pts;
  }
  function graphRaw(N) {
    const nodesUnit = [
      { x: -0.55, y:  0.55, label: "A" },
      { x: -0.05, y:  0.00, label: "B" },
      { x: -0.55, y: -0.55, label: "C" },
      { x:  0.65, y:  0.00, label: "D" }
    ];
    const spec = [
      { from: 0, to: 1, off: -0.14 },
      { from: 0, to: 1, off: +0.14 },
      { from: 2, to: 1, off: +0.14 },
      { from: 2, to: 1, off: -0.14 },
      { from: 0, to: 3, off: 0 },
      { from: 2, to: 3, off: 0 },
      { from: 1, to: 3, off: 0 }
    ];
    const edges = spec.map(s => {
      const a = nodesUnit[s.from], b = nodesUnit[s.to];
      if (s.off === 0) return { from: s.from, to: s.to, ctrlUnit: null };
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      const nx = -dy / len, ny = dx / len;
      return {
        from: s.from, to: s.to,
        ctrlUnit: { x: (a.x + b.x)/2 + nx*s.off, y: (a.y + b.y)/2 + ny*s.off }
      };
    });
    const pts = new Float32Array(N * 2);
    const dotsPerNode = Math.floor((N * 0.60) / nodesUnit.length);
    const dotsPerEdge = Math.floor((N * 0.40) / edges.length);
    let idx = 0;
    for (const n of nodesUnit) {
      for (let i = 0; i < dotsPerNode && idx < N; i++) {
        const u1 = Math.random(), u2 = Math.random();
        const r = Math.sqrt(-2*Math.log(u1)) * 0.055;
        const th = 2*Math.PI*u2;
        pts[idx*2] = n.x + r*Math.cos(th);
        pts[idx*2+1] = n.y + r*Math.sin(th);
        idx++;
      }
    }
    for (const e of edges) {
      const a = nodesUnit[e.from], b = nodesUnit[e.to];
      for (let i = 0; i < dotsPerEdge && idx < N; i++) {
        const t = 0.05 + Math.random() * 0.90;
        let x, y;
        if (e.ctrlUnit) {
          const omt = 1 - t;
          x = omt*omt*a.x + 2*omt*t*e.ctrlUnit.x + t*t*b.x;
          y = omt*omt*a.y + 2*omt*t*e.ctrlUnit.y + t*t*b.y;
        } else {
          x = a.x + (b.x - a.x) * t; y = a.y + (b.y - a.y) * t;
        }
        const jx = (Math.random()-0.5) * 0.018, jy = (Math.random()-0.5) * 0.018;
        pts[idx*2] = x + jx; pts[idx*2+1] = y + jy;
        idx++;
      }
    }
    while (idx < N) {
      const n = nodesUnit[idx % nodesUnit.length];
      pts[idx*2] = n.x + (Math.random()-0.5) * 0.06;
      pts[idx*2+1] = n.y + (Math.random()-0.5) * 0.06;
      idx++;
    }
    return { positions: pts, nodesUnit, edges, labels: nodesUnit.map(n => n.label) };
  }
  function lockGraphData(graph, dst) {
    const flat = [];
    for (const n of graph.nodesUnit) flat.push(n.x, n.y);
    const ctrlIdx = [];
    for (const e of graph.edges) {
      if (e.ctrlUnit) { ctrlIdx.push(flat.length / 2); flat.push(e.ctrlUnit.x, e.ctrlUnit.y); }
      else            { ctrlIdx.push(-1); }
    }
    const arr = new Float32Array(flat);
    const locked = lockToStats(arr, dst);
    const nodes = graph.nodesUnit.map((_, i) => ({ x: locked[i*2], y: locked[i*2+1] }));
    const edges = graph.edges.map((e, i) => {
      const ci = ctrlIdx[i];
      return ci >= 0
        ? { from: e.from, to: e.to, ctrl: { x: locked[ci*2], y: locked[ci*2+1] } }
        : { from: e.from, to: e.to, ctrl: null };
    });
    return { nodes, edges, labels: graph.labels };
  }

  /* ---------- dot order matching for clean morphs ---------- */
  function angleSortIdx(positions, N) {
    let mx = 0, my = 0;
    for (let i = 0; i < N; i++) { mx += positions[i*2]; my += positions[i*2+1]; }
    mx /= N; my /= N;
    const idx = Array.from({ length: N }, (_, i) => i);
    idx.sort((a, b) =>
      Math.atan2(positions[a*2+1]-my, positions[a*2]-mx) -
      Math.atan2(positions[b*2+1]-my, positions[b*2]-mx)
    );
    return idx;
  }
  function angleSortDotsIdx(dots) {
    const N = dots.length;
    let mx = 0, my = 0;
    for (const d of dots) { mx += d.baseX; my += d.baseY; }
    mx /= N; my /= N;
    const idx = Array.from({ length: N }, (_, i) => i);
    idx.sort((a, b) =>
      Math.atan2(dots[a].baseY-my, dots[a].baseX-mx) -
      Math.atan2(dots[b].baseY-my, dots[b].baseX-mx)
    );
    return idx;
  }
  function reorderTargets(positions, fromIdx, toIdx) {
    const N = toIdx.length;
    const out = new Float32Array(N * 2);
    for (let k = 0; k < N; k++) {
      out[toIdx[k]*2]   = positions[fromIdx[k]*2];
      out[toIdx[k]*2+1] = positions[fromIdx[k]*2+1];
    }
    return out;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
  }

  /* ---------- main build + render ---------- */
  function buildAndAnimate(photo, kData) {
    const weights = buildWeights(photo);
    const dots = samplePoints(weights, N_DOTS);
    relax(dots, weights, RELAX);
    /* Inset: shrink all dots toward the canvas centre so locked targets
       (esp. the graph state's outer nodes + their labels) stay clear of the
       border. Done once on the portrait so portraitStats already reflects
       the inset, and every subsequent locked state inherits the same margin. */
    const cx = W / 2, cy = H / 2;
    for (const d of dots) {
      d.baseX = cx + (d.baseX - cx) * INSET;
      d.baseY = cy + (d.baseY - cy) * INSET;
      d.x = d.baseX; d.y = d.baseY;
    }
    for (const d of dots) d.r = (0.55 + d.w * 1.2) * SIZE_MUL;
    assignThreeTone(dots, photo);

    const portraitStats = statsDots(dots);

    function fmt(s) {
      return `x̄ ${s.mx.toFixed(1)} · ȳ ${s.my.toFixed(1)} · ` +
             `σx ${s.sx.toFixed(1)} · σy ${s.sy.toFixed(1)} · ρ ${s.rho.toFixed(3)}`;
    }
    if (statsEl) statsEl.textContent = "STATS LOCKED · " + fmt(portraitStats);

    const portraitOrder = angleSortDotsIdx(dots);
    function buildStage(name, raw, hold, morph, extras = {}, lockFn = lockToStats) {
      const locked = lockFn(raw, portraitStats);
      const targetOrder = angleSortIdx(locked, dots.length);
      const reordered = reorderTargets(locked, targetOrder, portraitOrder);
      return { name, targets: reordered, hold, morph, ...extras };
    }

    const portraitTargets = new Float32Array(dots.length * 2);
    for (let i = 0; i < dots.length; i++) {
      portraitTargets[i*2]   = dots[i].baseX;
      portraitTargets[i*2+1] = dots[i].baseY;
    }
    const graphData = graphRaw(dots.length);
    const graphLocked = lockGraphData(graphData, portraitStats);

    const sequence = [
      { name: "portrait",          targets: portraitTargets, hold: 4.5, morph: 1.4 },
      buildStage("Gaussian cloud",    gaussianRaw(dots.length),             2.5, 1.4),
      /* All four states share the same five summary statistics —
         x̄, ȳ, σx, σy, ρ — by Cholesky-coloured affine transform. */
      buildStage("Königsberg · 1736", konigsbergRaw(dots.length, kData),    4.5, 1.7),
      buildStage("Euler's graph",     graphData.positions,                  4.5, 1.7,
                 { nodes: graphLocked.nodes, edges: graphLocked.edges, labels: graphLocked.labels })
    ];

    let stageIdx = 0;
    let stageStart = performance.now();
    let phase = "hold";
    let prev = portraitTargets;


    function frame() {
      const now = performance.now();
      const elapsed = (now - stageStart) / 1000;
      const stage = sequence[stageIdx];

      let lerped;
      if (phase === "hold") {
        lerped = stage.targets;
        if (elapsed >= stage.hold) { phase = "morph"; stageStart = now; prev = stage.targets; }
      } else {
        const next = sequence[(stageIdx + 1) % sequence.length];
        const t = Math.min(1, elapsed / next.morph);
        const e = easeInOutCubic(t);
        const N = dots.length;
        lerped = new Float32Array(N * 2);
        for (let i = 0; i < N; i++) {
          lerped[i*2]   = prev[i*2]   + (next.targets[i*2]   - prev[i*2])   * e;
          lerped[i*2+1] = prev[i*2+1] + (next.targets[i*2+1] - prev[i*2+1]) * e;
        }
        if (t >= 1) {
          stageIdx = (stageIdx + 1) % sequence.length;
          phase = "hold"; stageStart = now;
        }
      }

      ctx.fillStyle = COL.paper;
      ctx.fillRect(0, 0, W, H);

      /* Edges + labels for the graph state during hold */
      if (stage.edges && stage.nodes && phase === "hold") {
        ctx.strokeStyle = "rgba(26,53,84,0.32)";
        ctx.lineWidth = 1.0;
        for (const e of stage.edges) {
          const a = stage.nodes[e.from], b = stage.nodes[e.to];
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          if (e.ctrl) ctx.quadraticCurveTo(e.ctrl.x, e.ctrl.y, b.x, b.y);
          else        ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        if (stage.labels) {
          ctx.font = "italic 11px 'Source Serif 4', Georgia, serif";
          ctx.fillStyle = "rgba(26,53,84,0.7)";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          for (let i = 0; i < stage.nodes.length; i++) {
            const n = stage.nodes[i], lbl = stage.labels[i];
            if (!lbl) continue;
            /* Default: above the node. If too close to the top, flip below. */
            const labelY = (n.y - 22 < 14) ? n.y + 22 : n.y - 22;
            ctx.fillText(lbl, n.x, labelY);
          }
        }
      }

      const breath = (phase === "hold") ? 1.4 : 0.4;
      const t = now / 1000 * 4.0;
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        const tx = lerped[i*2], ty = lerped[i*2+1];
        const dx = Math.sin(t * 1.6 + d.phase) * breath;
        const dy = Math.cos(t * 1.4 + d.phase * 1.7) * breath * 0.85;
        ctx.fillStyle = d.colour;
        ctx.beginPath();
        ctx.arc(tx + dx, ty + dy, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(frame);
    }
    frame();
  }
}
