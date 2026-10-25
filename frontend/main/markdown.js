function mdParse(text) {
  return mdParseBlocks(text || "");
}

function mdParseBlocks(text) {
  const nodes = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("```", i)) {
      const close = text.indexOf("```", i + 3);
      const end = close === -1 ? text.length : close + 3;
      const raw = text.slice(i + 3, close === -1 ? text.length : close);
      let body = raw;
      if (body.startsWith("\n")) body = body.slice(1);
      else {
        const nl = body.indexOf("\n");
        if (nl !== -1 && /^[A-Za-z0-9_+-]+$/.test(body.slice(0, nl))) body = body.slice(nl + 1);
      }
      nodes.push({ type: "codeblock", text: body, raw, closed: close !== -1 });
      i = end;
      continue;
    }
    if (text.startsWith(">>>", i) && (i === 0 || text[i - 1] === "\n")) {
      const spaced = text[i + 3] === " ";
      nodes.push({ type: "quoteall", mark: spaced ? ">>> " : ">>>", text: text.slice(i + (spaced ? 4 : 3)) });
      break;
    }
    const lineEnd = text.indexOf("\n", i);
    const stop = lineEnd === -1 ? text.length : lineEnd;
    const line = text.slice(i, stop);
    const block = mdLineBlock(line);
    nodes.push(block || { type: "para", text: line });
    if (lineEnd === -1) break;
    nodes.push({ type: "break" });
    i = stop + 1;
  }
  return nodes;
}

function mdLineBlock(line) {
  const head = line.match(/^(#{1,3}) (.*)$/);
  if (head) return { type: "head", level: head[1].length, mark: head[1] + " ", text: head[2] };
  if (line.startsWith("-# ")) return { type: "sub", mark: "-# ", text: line.slice(3) };
  if (line.startsWith("> ")) return { type: "quote", mark: "> ", text: line.slice(2) };
  const list = line.match(/^( *)([-*]|\d+\.) (.*)$/);
  if (list && list[1].length % 2 === 0) {
    return { type: "list", indent: list[1].length / 2, marker: list[2], mark: list[1] + list[2] + " ", text: list[3] };
  }
  return null;
}

const MD_ADVANCED = {
  c: { type: "color", param: /^#[0-9A-Fa-f]{6}$/ },
  h: { type: "highlight", param: /^#[0-9A-Fa-f]{6}$/ },
  s: { type: "size", param: /^\d{1,2}$/ }
};

function mdTakeAdvanced(text, i) {
  const head = text.slice(i).match(/^\$([A-Za-z])([^\s()]*)\(/);
  if (!head) return null;
  const spec = MD_ADVANCED[head[1].toLowerCase()];
  if (!spec || !spec.param.test(head[2])) return null;
  const from = i + head[0].length;
  let depth = 1;
  let j = from;
  while (j < text.length) {
    const ch = text[j];
    if (ch === "\\") { j += 2; continue; }
    if (ch === "\n") return null;
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) break;
    }
    j += 1;
  }
  if (depth !== 0) return null;
  return {
    next: j + 1,
    node: { type: spec.type, value: head[2], open: head[0], close: ")", text: text.slice(from, j) }
  };
}

function mdParseInline(text) {
  const nodes = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\\" && i + 1 < text.length) {
      nodes.push({ type: "escape", mark: "\\", text: text[i + 1] });
      i += 2;
      continue;
    }
    const emoji = text.slice(i).match(/^<:([a-zA-Z0-9_]{2,32}):(\d+)>/);
    if (emoji) {
      nodes.push({ type: "emoji", name: emoji[1], id: emoji[2], raw: emoji[0] });
      i += emoji[0].length;
      continue;
    }
    const mention = text.slice(i).match(/^<@((?:everyone|here|&\d+|\d+))>/);
    if (mention) {
      nodes.push({ type: "mention", id: mention[1], raw: mention[0] });
      i += mention[0].length;
      continue;
    }
    const channel = text.slice(i).match(/^<#(\d+)>/);
    if (channel) {
      nodes.push({ type: "channel", id: channel[1], raw: channel[0] });
      i += channel[0].length;
      continue;
    }
    const bare = text.slice(i).match(/^<(https?:\/\/[^>\s]+)>/);
    if (bare) {
      nodes.push({ type: "link", open: "<", close: ">", text: bare[1], url: bare[1] });
      i += bare[0].length;
      continue;
    }
    if (text[i] === "`") {
      const close = text.indexOf("`", i + 1);
      if (close > i + 1 && !text.slice(i + 1, close).includes("\n")) {
        nodes.push({ type: "code", mark: "`", text: text.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }
    if (text.startsWith("||", i)) {
      const close = text.indexOf("||", i + 2);
      if (close !== -1) {
        nodes.push({ type: "explicit", mark: "||", text: text.slice(i + 2, close) });
        i = close + 2;
        continue;
      }
    }
    const image = text.slice(i).match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/);
    if (image) {
      nodes.push({ type: "image", text: image[1], url: image[2], raw: image[0] });
      i += image[0].length;
      continue;
    }
    if (text[i] === "$") {
      const advanced = mdTakeAdvanced(text, i);
      if (advanced) {
        nodes.push(advanced.node);
        i = advanced.next;
        continue;
      }
    }
    const link = text.slice(i).match(/^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/);
    if (link) {
      nodes.push({ type: "link", open: "[", close: "](" + link[2] + ")", text: link[1], url: link[2] });
      i += link[0].length;
      continue;
    }
    const wrapped = mdTakeWrap(text, i);
    if (wrapped) {
      nodes.push(wrapped.node);
      i = wrapped.next;
      continue;
    }
    let j = i + 1;
    while (j < text.length && !"\\`*_~[<!$".includes(text[j]) && !text.startsWith("||", j)) j += 1;
    nodes.push({ type: "text", text: text.slice(i, j) });
    i = j;
  }
  return nodes;
}

function mdTakeWrap(text, i) {
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
      node: { type: kinds[k][1], mark, text: inner }
    };
  }
  return null;
}

function mdAppend(el, text, options) {
  mdRender(el, mdParse(text || ""), options || {});
}

function mdPaintComposer(el, text, allowRoles) {
  el.replaceChildren();
  mdRender(el, mdParse(text || ""), { composer: true, allowRoles: allowRoles !== false });
}

function mdRender(el, nodes, options) {
  nodes.forEach((node) => mdRenderNode(el, node, options));
}

function mdMark(el, text, options) {
  if (!options.composer || !text) return;
  const span = document.createElement("span");
  span.className = "md-mark";
  span.textContent = text;
  el.appendChild(span);
}

function mdBox(el, node, className, options, tag) {
  const box = document.createElement(tag || "span");
  box.className = className;
  mdMark(box, node.mark, options);
  mdRender(box, mdParseInline(node.text), options);
  el.appendChild(box);
  return box;
}

function mdRenderNode(el, node, options) {
  if (node.type === "break") {
    el.appendChild(document.createTextNode("\n"));
    return;
  }
  if (node.type === "para") {
    mdRender(el, mdParseInline(node.text), options);
    return;
  }
  if (node.type === "text") {
    mdLeaf(el, node.text, options);
    return;
  }
  if (node.type === "escape") {
    mdMark(el, node.mark, options);
    el.appendChild(document.createTextNode(node.text));
    return;
  }
  if (node.type === "quoteall") {
    const quote = document.createElement(options.composer ? "span" : "div");
    quote.className = "md-quote";
    mdMark(quote, node.mark, options);
    mdRender(quote, mdParseBlocks(node.text), options);
    el.appendChild(quote);
    return;
  }
  if (node.type === "codeblock") {
    const pre = document.createElement(options.composer ? "span" : "pre");
    pre.className = "md-codeblock";
    if (options.composer) {
      mdMark(pre, "```", options);
      pre.appendChild(document.createTextNode(node.raw || ""));
      if (node.closed) mdMark(pre, "```", options);
    } else pre.textContent = node.text || "";
    el.appendChild(pre);
    return;
  }
  if (node.type === "code") {
    const code = document.createElement("code");
    code.className = "md-code";
    mdMark(code, node.mark, options);
    code.appendChild(document.createTextNode(node.text || ""));
    mdMark(code, node.mark, options);
    el.appendChild(code);
    return;
  }
  if (node.type === "mention") {
    if (!options.composer && typeof buildMentionChip === "function") {
      const msg = options.msg || {};
      el.appendChild(buildMentionChip(node.id, msg.mentionUsers || {}, msg, msg.mentionRoles || {}));
    } else mdLeaf(el, node.raw, options);
    return;
  }
  if (node.type === "channel") {
    if (!options.composer && typeof buildChannelMentionChip === "function") el.appendChild(buildChannelMentionChip(node.id));
    else mdLeaf(el, node.raw, options);
    return;
  }
  if (node.type === "emoji") {
    if (!options.composer && typeof appendCustomEmojiNode === "function") appendCustomEmojiNode(el, node.name, node.id);
    else mdLeaf(el, node.raw, options);
    return;
  }
  if (node.type === "image") {
    if (options.composer) {
      mdMark(el, node.raw, options);
      return;
    }
    const img = document.createElement("img");
    img.className = "md-image";
    img.alt = node.text || "";
    img.src = node.url;
    if (typeof bindChatImageLightbox === "function") bindChatImageLightbox(img, node.url);
    el.appendChild(img);
    return;
  }
  if (node.type === "color" || node.type === "highlight" || node.type === "size") {
    const span = document.createElement("span");
    span.className = "md-" + node.type;
    if (node.type === "color") span.style.color = node.value;
    else if (node.type === "highlight") span.style.background = node.value;
    else span.style.fontSize = Math.max(8, Math.min(24, Number(node.value) || 11)) + "pt";
    mdMark(span, node.open, options);
    mdRender(span, mdParseInline(node.text), options);
    mdMark(span, node.close, options);
    el.appendChild(span);
    return;
  }
  if (node.type === "link") {
    if (options.composer) {
      mdMark(el, node.open, options);
      const text = document.createElement("span");
      text.className = "msg-link";
      text.textContent = node.text || node.url;
      el.appendChild(text);
      mdMark(el, node.close, options);
      return;
    }
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
    mdMark(span, node.mark, options);
    mdRender(span, mdParseInline(node.text), options);
    mdMark(span, node.mark, options);
    if (!options.composer) {
      span.addEventListener("click", (event) => {
        event.stopPropagation();
        span.classList.toggle("is-open");
      });
    }
    el.appendChild(span);
    return;
  }
  if (node.type === "head") {
    mdBox(el, node, "md-h" + node.level, options);
    return;
  }
  if (node.type === "sub") {
    mdBox(el, node, "md-sub", options);
    return;
  }
  if (node.type === "quote") {
    mdBox(el, node, "md-quote", options);
    return;
  }
  if (node.type === "list") {
    const box = document.createElement("span");
    box.className = "md-list";
    if (options.composer) mdMark(box, node.mark, options);
    else {
      if (node.indent) box.style.marginLeft = (node.indent * 16) + "px";
      box.appendChild(document.createTextNode((/^\d+\.$/.test(node.marker) ? node.marker : "•") + " "));
    }
    mdRender(box, mdParseInline(node.text), options);
    el.appendChild(box);
    return;
  }
  const classes = {
    bold: "md-bold",
    italic: "md-italic",
    bolditalic: "md-bold md-italic",
    under: "md-under",
    strike: "md-strike"
  };
  const box = document.createElement("span");
  box.className = classes[node.type] || "";
  mdMark(box, node.mark, options);
  mdRender(box, mdParseInline(node.text), options);
  mdMark(box, node.mark, options);
  el.appendChild(box);
}

function mdLeaf(el, text, options) {
  const source = text || "";
  if (!source) return;
  if (options && options.composer) {
    mdComposerLeaf(el, source, options);
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

function mdAppendHashText(el, text) {
  String(text || "").split(/(#[A-Za-z0-9_]+)/g).forEach((part) => {
    if (!part) return;
    if (/^#[A-Za-z0-9_]+$/.test(part)) {
      const mark = document.createElement("span");
      mark.className = "community-post-hash";
      mark.textContent = part;
      el.appendChild(mark);
    } else {
      el.appendChild(document.createTextNode(part));
    }
  });
}

function mdComposerLeaf(el, text, options) {
  const names = typeof validComposerMentionNames === "function" ? validComposerMentionNames(!!(options && options.allowRoles)) : [];
  if (!names.length) {
    mdAppendHashText(el, text);
    return;
  }
  const pattern = new RegExp("@(?:" + names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b", "gi");
  let last = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > last) mdAppendHashText(el, text.slice(last, match.index));
    const chip = document.createElement("span");
    chip.className = "composer-mention";
    chip.textContent = match[0];
    el.appendChild(chip);
    last = match.index + match[0].length;
  }
  if (last < text.length) mdAppendHashText(el, text.slice(last));
}
