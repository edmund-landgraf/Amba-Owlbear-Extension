function wrapLine(context, text, maxWidth) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let current = words[0];
  for (const word of words.slice(1)) {
    const next = `${current} ${word}`;
    if (context.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

export function rasterizeStatCardPng({ header, name, meta, rows, width = 1040, height = 760 }) {
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext("2d");
  context.scale(scale, scale);
  context.fillStyle = "#f7f2e8";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#4a4036";
  context.lineWidth = 6;
  context.strokeRect(3, 3, width - 6, height - 6);

  const left = 40;
  const maxWidth = width - 80;
  let y = 48;
  context.fillStyle = "#251f1a";
  context.textBaseline = "top";

  context.font = "bold 22px Consolas, ui-monospace, monospace";
  context.fillText(header, left, y);
  y += 32;

  context.font = "bold 28px Consolas, ui-monospace, monospace";
  for (const line of wrapLine(context, name, maxWidth)) {
    context.fillText(line, left, y);
    y += 34;
  }

  if (meta) {
    context.font = "16px Consolas, ui-monospace, monospace";
    for (const line of wrapLine(context, meta, maxWidth)) {
      context.fillText(line, left, y);
      y += 22;
    }
    y += 8;
  }

  context.font = "17px Consolas, ui-monospace, monospace";
  const lineHeight = 22;
  for (const { label, value } of rows) {
    const labelText = `${String(label).padEnd(11, " ")} `;
    const labelWidth = context.measureText(labelText).width;
    const wrapped = wrapLine(context, value, maxWidth - labelWidth);
    wrapped.forEach((line, index) => {
      if (y > height - 36) return;
      if (index === 0) {
        context.font = "bold 17px Consolas, ui-monospace, monospace";
        context.fillText(labelText, left, y);
        context.font = "17px Consolas, ui-monospace, monospace";
        context.fillText(line, left + labelWidth, y);
      } else {
        context.fillText(line, left + labelWidth, y);
      }
      y += lineHeight;
    });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Unable to render stat card"));
        return;
      }
      resolve(new File([blob], "stat-card.png", { type: "image/png" }));
    }, "image/png");
  });
}
