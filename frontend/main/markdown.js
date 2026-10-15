function mdCaret(caret) {
  if (!caret) return null;
  if (typeof caret === "number") return { start: caret, end: caret };
  return caret;
}

function mdHit(node, caret) {
  const span = mdCaret(caret);
  if (!span || !node) return false;
  return span.end >= node.start && span.start <= node.end;
}

function mdParse(text) {
  return mdParseBlocks(text || "", 0);
}

function mdParseBlocks(text, offset) {
  const nodes = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("```", i)) {
      const close = text.indexOf("```", i + 3);
      const end = close === -1 ? text.length : close + 3;
      let body = text.slice(i + 3, close === -1 ? text.length : close);
      if (body.startsWith("\n")) body = body.slice(1);
      else {
        const nl = body.indexOf("\n");
        if (nl !== -1 && /^[A-Za-z0-9_+-]+$/.test(body.slice(0, nl))) body = body.slice(nl + 1);
      }
      nodes.push({ type: "codeblock", start: offset + i, end: offset + end, text: body });
      i = end;
      continue;
    }
    if (text.startsWith(">>>", i) && (i === 0 || text[i - 1] === "\n")) {
      nodes.push({ type: "quoteall", start: offset + i, end: offset + text.length, text: text.slice(i + 3).replace(/^ /, "") });
      break;
    }
    const lineEnd = text.indexOf("\n", i);
    const stop = lineEnd === -1 ? text.length : lineEnd;
    const line = text.slice(i, stop);
    const block = mdLineBlock(line);
    if (block) nodes.push(Object.assign({ start: offset + i, end: offset + stop }, block));
    else nodes.push({ type: "para", start: offset + i, end: offset + stop, text: line });
    if (lineEnd === -1) break;
    nodes.push({ type: "break", start: offset + stop, end: offset + stop + 1 });
    i = stop + 1;
  }
  return nodes;
}

function mdLineBlock(line) {
  const head = line.match(/^(#{1,3}) (.*)$/);
  if (head) return { type: "head", level: head[1].length, text: head[2] };
  if (line.startsWith("-# ")) return { type: "sub", text: line.slice(3) };
  if (line.startsWith("> ")) return { type: "quote", text: line.slice(2) };
  const list = line.match(/^( *)([-*]|\d+\.) (.*)$/);
  if (list && list[1].length % 2 === 0) {
    return { type: "list", indent: list[1].length / 2, marker: list[2], text: list[3] };
  }
  return null;
}

function mdParseInline(text, offset) {
  const nodes = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\\" && i + 1 < text.length) {
      nodes.push({ type: "text", start: offset + i, end: offset + i + 2, text: text[i + 1] });
      i += 2;
      continue;
    }
    const emoji = text.slice(i).match(/^<:([a-zA-Z0-9_]{2,32}):(\d+)>/);
    if (emoji) {
      nodes.push({ type: "emoji", start: offset + i, end: offset + i + emoji[0].length, name: emoji[1], id: emoji[2], raw: emoji[0] });
      i += emoji[0].length;
      continue;
    }
    const mention = text.slice(i).match(/^<@((?:everyone|here|&\d+|\d+))>/);
    if (mention) {
      nodes.push({ type: "mention", start: offset + i, end: offset + i + mention[0].length, id: mention[1], raw: mention[0] });
      i += mention[0].length;
      continue;
    }
    const channel = text.slice(i).match(/^<#(\d+)>/);
    if (channel) {
      nodes.push({ type: "channel", start: offset + i, end: offset + i + channel[0].length, id: channel[1], raw: channel[0] });
      i += channel[0].length;
      continue;
    }
    const bare = text.slice(i).match(/^<(https?:\/\/[^>\s]+)>/);
    if (bare) {
      nodes.push({ type: "link", start: offset + i, end: offset + i + bare[0].length, text: bare[1], url: bare[1] });
      i += bare[0].length;
      continue;
    }
    if (text[i] === "`") {
      const close = text.indexOf("`", i + 1);
      if (close > i + 1 && !text.slice(i + 1, close).includes("\n")) {
        nodes.push({ type: "code", start: offset + i, end: offset + close + 1, text: text.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }
    if (text.startsWith("||", i)) {
      const close = text.indexOf("||", i + 2);
      if (close !== -1) {
        nodes.push({ type: "explicit", start: offset + i, end: offset + close + 2, text: text.slice(i + 2, close) });
        i = close + 2;
        continue;
      }
    }
    const image = text.slice(i).match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/);
    if (image) {
      nodes.push({ type: "image", start: offset + i, end: offset + i + image[0].length, text: image[1], url: image[2] });
      i += image[0].length;
      continue;
    }
    const paint = text.slice(i).match(/^\{\{(c|h|s):(#[0-9A-Fa-f]{6}|\d{1,2})\}\}/);
    if (paint) {
      const closer = "{{/" + paint[1] + "}}";
      const closeAt = text.indexOf(closer, i + paint[0].length);
      if (closeAt !== -1) {
        nodes.push({
          type: paint[1] === "c" ? "color" : paint[1] === "h" ? "highlight" : "size",
          start: offset + i,
          end: offset + closeAt + closer.length,
          inner: offset + i + paint[0].length,
          value: paint[2],
          text: text.slice(i + paint[0].length, closeAt)
        });
        i = closeAt + closer.length;
        continue;
      }
    }
    const link = text.slice(i).match(/^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/);
    if (link) {
      nodes.push({ type: "link", start: offset + i, end: offset + i + link[0].length, text: link[1], url: link[2] });
      i += link[0].length;
      continue;
    }
    const wrapped = mdTakeWrap(text, i, offset);
    if (wrapped) {
      nodes.push(wrapped.node);
      i = wrapped.next;
      continue;
    }
    let j = i + 1;
    while (j < text.length && text[j] !== "\\" && text[j] !== "`" && text[j] !== "*" && text[j] !== "_" && text[j] !== "~" && text[j] !== "[" && text[j] !== "<" && text[j] !== "!" && text[j] !== "{" && !text.startsWith("||", j)) j += 1;
    nodes.push({ type: "text", start: offset + i, end: offset + j, text: text.slice(i, j) });
    i = j;
  }
  return nodes;
}

function mdTakeWrap(text, i, offset) {
  const kinds = [
    ["***", "bolditalic"],
    ["**", "bold"],
    ["__", "under"],
    ["~~", "strike"],
    ["*", "italic"],
    ["_", "italic"]
  ];
  for (let k = 0; k < kinds.length; k += 1) {
    const mark = kinds[k][0];
    if (!text.startsWith(mark, i)) continue;
    if (mark === "_" && i > 0 && /[\w]/.test(text[i - 1])) continue;
    const from = i + mark.length;
    const close = text.indexOf(mark, from);
    if (close <= from) continue;
    const inner = text.slice(from, close);
    if (inner.includes("\n")) continue;
    if (mark === "_" && /[\w]/.test(text[close + mark.length] || "")) continue;
    return {
      next: close + mark.length,
      node: { type: kinds[k][1], start: offset + i, end: offset + close + mark.length, text: inner }
    };
  }
  return null;
}

function mdAppend(el, text, options) {
  mdRender(el, mdParse(text || ""), text || "", null, options || {});
}

function mdPaintComposer(el, text, caret, allowRoles) {
  el.replaceChildren();
  const collapsed = !caret || caret.start === caret.end;
  const options = {
    composer: true,
    allowRoles: allowRoles !== false,
    caretIndex: collapsed && caret ? caret.start : null,
    caretPlaced: false
  };
  mdRender(el, mdParse(text || ""), text || "", mdCaret(caret), options);
  if (options.caretIndex != null && !options.caretPlaced) mdDropCaret(el, options);
}

function mdRender(el, nodes, source, caret, options) {
  nodes.forEach((node) => mdRenderNode(el, node, source, caret, options));
}

function mdRenderNode(el, node, source, caret, options) {
  if (node.type === "break") {
    mdWrite(el, "", node.start, options);
    el.appendChild(document.createTextNode("\n"));
    return;
  }
  if (node.type === "para") {
    mdRender(el, mdParseInline(node.text, node.start), source, caret, options);
    return;
  }
  if (mdHit(node, caret)) {
    mdLeaf(el, source.slice(node.start, node.end), options, node.start);
    return;
  }
  if (node.type === "quoteall") {
    const quote = document.createElement("div");
    quote.className = "md-quote";
    mdRender(quote, mdParseBlocks(node.text, node.start), source, null, options);
    el.appendChild(quote);
    return;
  }
  if (node.type === "codeblock") {
    const pre = document.createElement("pre");
    pre.className = "md-codeblock";
    pre.textContent = node.text || "";
    el.appendChild(pre);
    return;
  }
  if (node.type === "code") {
    const code = document.createElement("code");
    code.className = "md-code";
    code.textContent = node.text || "";
    el.appendChild(code);
    return;
  }
  if (node.type === "text") {
    mdLeaf(el, node.text, options, node.start);
    return;
  }
  if (node.type === "mention") {
    if (!options.composer && typeof buildMentionChip === "function") {
      const msg = options.msg || {};
      el.appendChild(buildMentionChip(node.id, msg.mentionUsers || {}, msg, msg.mentionRoles || {}));
    } else mdLeaf(el, node.raw, options, node.start);
    return;
  }
  if (node.type === "channel") {
    if (!options.composer && typeof buildChannelMentionChip === "function") el.appendChild(buildChannelMentionChip(node.id));
    else mdLeaf(el, node.raw, options, node.start);
    return;
  }
  if (node.type === "image") {
    const img = document.createElement("img");
    img.className = "md-image";
    img.alt = node.text || "";
    img.src = node.url;
    el.appendChild(img);
    return;
  }
  if (node.type === "emoji") {
    if (!options.composer && typeof appendCustomEmojiNode === "function") appendCustomEmojiNode(el, node.name, node.id);
    else mdLeaf(el, node.raw, options, node.start);
    return;
  }
  if (node.type === "color" || node.type === "highlight" || node.type === "size") {
    const span = document.createElement("span");
    span.className = "md-" + node.type;
    if (node.type === "color") span.style.color = node.value;
    else if (node.type === "highlight") span.style.background = node.value;
    else span.style.fontSize = Math.max(6, Math.min(72, Number(node.value) || 11)) + "pt";
    mdRender(span, mdParseInline(node.text, node.inner), source, null, options);
    el.appendChild(span);
    return;
  }
  if (node.type === "link") {
    const link = document.createElement("a");
    link.className = "msg-link";
    link.href = node.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = node.text || node.url;
    el.appendChild(link);
    return;
  }
  if (node.type === "explicit") {
    const span = document.createElement("span");
    span.className = "md-explicit";
    mdRender(span, mdParseInline(node.text, node.start + 2), source, null, options);
    if (!options.composer) {
      span.addEventListener("click", (event) => {
        event.stopPropagation();
        span.classList.toggle("is-open");
      });
    }
    el.appendChild(span);
    return;
  }
  const box = document.createElement(node.type === "code" ? "code" : "span");
  if (node.type === "bold") box.className = "md-bold";
  else if (node.type === "italic") box.className = "md-italic";
  else if (node.type === "bolditalic") box.className = "md-bold md-italic";
  else if (node.type === "under") box.className = "md-under";
  else if (node.type === "strike") box.className = "md-strike";
  else if (node.type === "head") {
    box.className = "md-h" + node.level;
  } else if (node.type === "sub") box.className = "md-sub";
  else if (node.type === "quote" || node.type === "quoteall") box.className = "md-quote";
  else if (node.type === "list") {
    box.className = "md-list";
    if (node.indent) box.style.marginLeft = (node.indent * 16) + "px";
    box.appendChild(document.createTextNode((/^\d+\.$/.test(node.marker) ? node.marker : "•") + " "));
  }
  if (node.text != null && node.type !== "text") mdRender(box, mdParseInline(node.text, node.start), source, null, options);
  el.appendChild(box);
}

function mdDropCaret(el, options) {
  if (!options || options.caretPlaced) return;
  const mark = document.createElement("span");
  mark.className = "composer-caret";
  el.appendChild(mark);
  options.caretPlaced = true;
}

function mdWrite(el, text, absStart, options) {
  const caretAt = options && Number.isInteger(options.caretIndex) ? options.caretIndex : null;
  const source = text || "";
  if (caretAt != null && options && !options.caretPlaced && caretAt >= absStart && caretAt <= absStart + source.length) {
    const cut = caretAt - absStart;
    if (cut > 0) el.appendChild(document.createTextNode(source.slice(0, cut)));
    mdDropCaret(el, options);
    if (cut < source.length) el.appendChild(document.createTextNode(source.slice(cut)));
    return;
  }
  if (source) el.appendChild(document.createTextNode(source));
}

function mdLeaf(el, text, options, absStart) {
  const source = text || "";
  if (!source && !(options && Number.isInteger(options.caretIndex))) return;
  if (options && options.composer) {
    mdComposerLeaf(el, source, options, absStart || 0);
    return;
  }
  if (typeof CUSTOM_EMOJI_TOKEN_RE !== "undefined" && typeof appendCustomEmojiNode === "function") {
    let last = 0;
    CUSTOM_EMOJI_TOKEN_RE.lastIndex = 0;
    let match;
    while ((match = CUSTOM_EMOJI_TOKEN_RE.exec(source))) {
      if (match.index > last && typeof appendAutoLinks === "function") appendAutoLinks(el, source.slice(last, match.index));
      else if (match.index > last) el.appendChild(document.createTextNode(source.slice(last, match.index)));
      appendCustomEmojiNode(el, match[1], match[2]);
      last = match.index + match[0].length;
    }
    if (last < source.length && typeof appendAutoLinks === "function") appendAutoLinks(el, source.slice(last));
    else if (last < source.length) el.appendChild(document.createTextNode(source.slice(last)));
    return;
  }
  if (typeof appendAutoLinks === "function") appendAutoLinks(el, source);
  else el.appendChild(document.createTextNode(source));
}

function mdComposerLeaf(el, text, options, absStart) {
  const base = absStart || 0;
  const names = typeof validComposerMentionNames === "function" ? validComposerMentionNames(!!(options && options.allowRoles)) : [];
  if (!names.length) {
    mdWrite(el, text, base, options);
    return;
  }
  const pattern = new RegExp("@(?:" + names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b", "gi");
  let last = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > last) mdWrite(el, text.slice(last, match.index), base + last, options);
    const chip = document.createElement("span");
    chip.className = "composer-mention";
    chip.textContent = match[0];
    const caretAt = options && Number.isInteger(options.caretIndex) ? options.caretIndex : null;
    const chipStart = base + match.index;
    if (caretAt != null && !options.caretPlaced && caretAt >= chipStart && caretAt <= chipStart + match[0].length) {
      mdDropCaret(el, options);
    }
    el.appendChild(chip);
    last = match.index + match[0].length;
  }
  if (last < text.length) mdWrite(el, text.slice(last), base + last, options);
  else mdWrite(el, "", base + last, options);
}
