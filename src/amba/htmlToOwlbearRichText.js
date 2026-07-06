const BLOCK_TAGS = new Set([
  "ARTICLE", "DIV", "DL", "FOOTER", "HEADER", "MAIN", "SECTION",
]);

function normalizedText(value) {
  return value.replace(/\s+/g, " ");
}

function inlineNodes(node, marks = {}) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = normalizedText(node.textContent ?? "");
    return text ? [{ text, ...marks }] : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const element = node;
  if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(element.tagName)) return [];
  if (element.tagName === "BR") return [{ text: "\n", ...marks }];

  const nextMarks = {
    ...marks,
    ...(["B", "STRONG", "LABEL", "TH"].includes(element.tagName) ? { bold: true } : {}),
    ...(["EM", "I"].includes(element.tagName) ? { italic: true } : {}),
  };
  return [...element.childNodes].flatMap((child) => inlineNodes(child, nextMarks));
}

function cleanInline(nodes) {
  const cleaned = [];
  for (const node of nodes) {
    const text = node.text.replace(/^\s+|\s+$/g, cleaned.length ? " " : "");
    if (!text) continue;
    const previous = cleaned.at(-1);
    if (previous && previous.bold === node.bold && previous.italic === node.italic) {
      previous.text += text;
    } else {
      cleaned.push({ ...node, text });
    }
  }
  return cleaned.length ? cleaned : [{ text: "" }];
}

function paragraph(element, type = "paragraph") {
  return { type, children: cleanInline(inlineNodes(element)) };
}

function tableRows(table) {
  return [...table.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr")]
    .map((row) => {
      const cells = [...row.children].filter((cell) => ["TD", "TH"].includes(cell.tagName));
      const children = [];
      cells.forEach((cell, index) => {
        if (index) children.push({ text: " | " });
        children.push(...inlineNodes(cell, cell.tagName === "TH" ? { bold: true } : {}));
      });
      return { type: "paragraph", children: cleanInline(children) };
    })
    .filter((row) => row.children.some((child) => child.text.trim()));
}

function listElement(element) {
  const type = element.tagName === "OL" ? "numbered-list" : "bulleted-list";
  const children = [...element.children]
    .filter((child) => child.tagName === "LI")
    .map((item) => ({ type: "list-item", children: cleanInline(inlineNodes(item)) }));
  return children.length ? [{ type, children }] : [];
}

function blockNodes(element) {
  if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(element.tagName)) return [];
  if (element.tagName === "H1") return [paragraph(element, "heading-one")];
  if (/^H[2-6]$/.test(element.tagName)) return [paragraph(element, "heading-two")];
  if (["P", "PRE", "BLOCKQUOTE"].includes(element.tagName)) return [paragraph(element)];
  if (["UL", "OL"].includes(element.tagName)) return listElement(element);
  if (element.tagName === "TABLE") return tableRows(element);

  if (BLOCK_TAGS.has(element.tagName) || element.tagName === "BODY") {
    const blocks = [];
    let inlineBuffer = [];
    const flushInline = () => {
      const children = cleanInline(inlineBuffer);
      if (children.some((child) => child.text.trim())) blocks.push({ type: "paragraph", children });
      inlineBuffer = [];
    };

    for (const child of element.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childElement = child;
        const isBlock = BLOCK_TAGS.has(childElement.tagName) ||
          ["H1", "H2", "H3", "H4", "H5", "H6", "P", "PRE", "BLOCKQUOTE", "UL", "OL", "TABLE"].includes(childElement.tagName);
        if (isBlock) {
          flushInline();
          blocks.push(...blockNodes(childElement));
          continue;
        }
      }
      inlineBuffer.push(...inlineNodes(child));
    }
    flushInline();
    return blocks;
  }

  return [paragraph(element)];
}

export function htmlToOwlbearRichText(html) {
  const document = new DOMParser().parseFromString(html, "text/html");
  const richText = blockNodes(document.body);
  return richText.length ? richText : [{ type: "paragraph", children: [{ text: "" }] }];
}
