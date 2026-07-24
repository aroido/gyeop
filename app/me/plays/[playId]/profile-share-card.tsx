"use client";

import {
  buildProfileShareCardPresentation,
  PROFILE_SHARE_FILENAME,
} from "@/lib/owner-profile/profile-share-card-core.mjs";
import type {
  ProfileShareCardModel,
  ProfileShareCardPresentation,
} from "@/lib/owner-profile/owner-profile";

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

export function ProfileShareCardPreview({
  model,
}: {
  model: ProfileShareCardModel;
}) {
  const presentation = buildProfileShareCardPresentation(
    model,
  ) as ProfileShareCardPresentation;
  return (
    <article
      className={styles.preview}
      aria-label={`${model.relationshipLabel} 시선 공유 카드 미리보기`}
    >
      <header>
        <p>{model.packTitle}</p>
        <span>{presentation.relationshipText}</span>
      </header>
      <section className={styles.result}>
        <p>친구가 본 나</p>
        <h2>{presentation.resultText}</h2>
        {presentation.agreementText ? (
          <strong data-state={presentation.resultState}>
            {presentation.agreementText}
          </strong>
        ) : null}
        <p className={styles.selfChoice}>{presentation.selfText}</p>
      </section>
      <section className={styles.detail}>
        <p className={styles.detailLabel}>질문</p>
        <p className={styles.question}>{presentation.questionText}</p>
        <p className={styles.distribution}>{presentation.distributionText}</p>
      </section>
      <strong className={styles.brand}>겹</strong>
    </article>
  );
}

export async function renderProfileShareCard(
  model: ProfileShareCardModel,
): Promise<File> {
  const presentation = buildProfileShareCardPresentation(
    model,
  ) as ProfileShareCardPresentation;
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
  drawTextBlock(context, model.packTitle, 130, 150, 820, 54, 40, 26, "#ffffff");
  roundedRect(context, 130, 235, 560, 76, 38);
  context.fillStyle = "#dfff00";
  context.fill();
  drawTextBlock(
    context,
    presentation.relationshipText,
    164,
    251,
    490,
    44,
    34,
    24,
    "#050505",
  );

  context.fillStyle = "#315cff";
  context.font = '900 34px Pretendard, "Apple SD Gothic Neo", sans-serif';
  context.fillText("친구가 본 나", 130, 420);
  drawTextBlock(
    context,
    presentation.resultText,
    130,
    475,
    820,
    400,
    76,
    26,
    "#050505",
    950,
  );

  if (presentation.agreementText) {
    roundedRect(context, 130, 900, 390, 82, 41);
    context.fillStyle =
      presentation.resultState === "match" ? "#dfff00" : "#ff4d42";
    context.fill();
    drawTextBlock(
      context,
      presentation.agreementText,
      170,
      920,
      310,
      42,
      34,
      24,
      "#050505",
    );
  }
  drawTextBlock(
    context,
    presentation.selfText,
    130,
    presentation.agreementText ? 1010 : 920,
    820,
    90,
    38,
    18,
    "#050505",
  );

  roundedRect(context, 130, 1120, 820, 450, 40);
  context.fillStyle = "#050505";
  context.fill();
  context.fillStyle = "#dfff00";
  context.font = '900 30px Pretendard, "Apple SD Gothic Neo", sans-serif';
  context.fillText("질문", 180, 1170);
  drawTextBlock(
    context,
    presentation.questionText,
    180,
    1220,
    720,
    250,
    42,
    22,
    "#ffffff",
  );
  context.fillStyle = "#ffffff";
  context.font = '900 34px Pretendard, "Apple SD Gothic Neo", sans-serif';
  context.fillText(presentation.distributionText, 180, 1490);

  context.fillStyle = "#050505";
  context.font = '950 72px Pretendard, "Apple SD Gothic Neo", sans-serif';
  context.fillText("겹", 130, 1680);

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
