"use client";

import { PROFILE_SHARE_FILENAME } from "@/lib/owner-profile/profile-share-card-core.mjs";
import type { ProfileShareCardModel } from "@/lib/owner-profile/owner-profile";

import styles from "./profile-share-card.module.css";

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.closePath();
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maximumWidth: number,
) {
  const lines: string[] = [];
  let current = "";
  for (const character of Array.from(text)) {
    const candidate = `${current}${character}`;
    if (current && context.measureText(candidate).width > maximumWidth) {
      lines.push(current.trimEnd());
      current = character.trimStart();
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current.trimEnd());
  return lines;
}

function fittedText(
  context: CanvasRenderingContext2D,
  text: string,
  maximumWidth: number,
  maximumHeight: number,
  maximumFontSize: number,
  minimumFontSize: number,
  weight = 900,
) {
  for (
    let fontSize = maximumFontSize;
    fontSize >= minimumFontSize;
    fontSize -= 2
  ) {
    context.font = `${weight} ${fontSize}px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    const lines = wrapText(context, text, maximumWidth);
    const lineHeight = Math.ceil(fontSize * 1.22);
    if (lines.length * lineHeight <= maximumHeight) {
      return { fontSize, lineHeight, lines };
    }
  }
  throw new Error("Profile share card text does not fit");
}

function drawTextBlock(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maximumWidth: number,
  maximumHeight: number,
  maximumFontSize: number,
  minimumFontSize: number,
  color: string,
  weight = 900,
) {
  const layout = fittedText(
    context,
    text,
    maximumWidth,
    maximumHeight,
    maximumFontSize,
    minimumFontSize,
    weight,
  );
  context.fillStyle = color;
  layout.lines.forEach((line, index) => {
    context.fillText(line, x, y + index * layout.lineHeight);
  });
}

function drawChoice(
  context: CanvasRenderingContext2D,
  model: ProfileShareCardModel,
  choice: "a" | "b",
  y: number,
) {
  const selected = model.selfChoice === choice;
  const label = choice === "a" ? "A" : "B";
  const option = choice === "a" ? model.optionA : model.optionB;
  const count = model.counts[choice];
  roundedRect(context, 130, y, 820, 300, 36);
  context.fillStyle = selected ? "#dfff00" : "#050505";
  context.fill();
  context.fillStyle = selected ? "#050505" : "#ffffff";
  context.font = '900 34px Pretendard, "Apple SD Gothic Neo", sans-serif';
  context.fillText(selected ? `${label} · 내 선택` : label, 180, y + 38);
  context.textAlign = "right";
  context.fillText(`${count}명`, 900, y + 38);
  context.textAlign = "left";
  drawTextBlock(
    context,
    option,
    180,
    y + 100,
    720,
    168,
    46,
    24,
    selected ? "#050505" : "#ffffff",
  );
}

export function ProfileShareCardPreview({
  model,
}: {
  model: ProfileShareCardModel;
}) {
  const selected = model.selfChoice === "a" ? model.optionA : model.optionB;
  return (
    <article
      className={styles.preview}
      aria-label={`${model.relationshipLabel} 시선 공유 카드 미리보기`}
    >
      <header>
        <p>겹 · {model.packTitle}</p>
        <span>{model.relationshipLabel} 시선</span>
      </header>
      <h2>{model.prompt}</h2>
      <p className={styles.selfChoice}>내 선택 · {selected}</p>
      <div className={styles.choices}>
        <p data-selected={model.selfChoice === "a"}>
          <span>A · {model.optionA}</span>
          <strong>{model.counts.a}명</strong>
        </p>
        <p data-selected={model.selfChoice === "b"}>
          <span>B · {model.optionB}</span>
          <strong>{model.counts.b}명</strong>
        </p>
      </div>
      <strong className={styles.brand}>겹</strong>
    </article>
  );
}

export async function renderProfileShareCard(
  model: ProfileShareCardModel,
): Promise<File> {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

  context.textBaseline = "top";
  context.fillStyle = "#050505";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (const [offset, color] of [
    [66, "#ff4d42"],
    [44, "#dfff00"],
    [22, "#315cff"],
  ] as const) {
    roundedRect(context, 72 + offset, 136 + offset, 936, 1680, 52);
    context.fillStyle = color;
    context.fill();
  }

  roundedRect(context, 72, 100, 936, 1720, 52);
  context.fillStyle = "#f5f1e9";
  context.fill();

  roundedRect(context, 72, 100, 936, 260, 52);
  context.fillStyle = "#315cff";
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = '900 40px Pretendard, "Apple SD Gothic Neo", sans-serif';
  context.fillText("겹", 130, 150);
  drawTextBlock(context, model.packTitle, 220, 150, 720, 54, 40, 26, "#ffffff");
  roundedRect(context, 130, 235, 420, 76, 38);
  context.fillStyle = "#dfff00";
  context.fill();
  drawTextBlock(
    context,
    `${model.relationshipLabel} 시선`,
    164,
    251,
    350,
    44,
    34,
    24,
    "#050505",
  );

  drawTextBlock(
    context,
    model.prompt,
    130,
    430,
    820,
    500,
    76,
    34,
    "#050505",
    950,
  );
  drawChoice(context, model, "a", 970);
  drawChoice(context, model, "b", 1300);

  context.fillStyle = "#050505";
  context.font = '900 34px Pretendard, "Apple SD Gothic Neo", sans-serif';
  context.fillText("관계마다 다르게 보이는 나", 130, 1650);
  context.font = '950 72px Pretendard, "Apple SD Gothic Neo", sans-serif';
  context.fillText("겹", 130, 1720);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("PNG render failed")),
      "image/png",
    );
  });
  return new File([blob], PROFILE_SHARE_FILENAME, {
    type: "image/png",
    lastModified: 0,
  });
}

export function downloadProfileShareCard(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = PROFILE_SHARE_FILENAME;
  anchor.click();
  URL.revokeObjectURL(url);
}
