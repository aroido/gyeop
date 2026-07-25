"use client";

import {
  buildProfileShareCardPresentation,
  decodeConceptProfileShareCardModel,
  PROFILE_SHARE_FILENAME,
} from "@/lib/owner-profile/profile-share-card-core.mjs";
import type {
  ConceptProfileShareAxis,
  ConceptProfileShareCardModel,
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

function isConceptShareCard(
  model: ProfileShareCardModel,
): model is ConceptProfileShareCardModel {
  return "axes" in model;
}

function positionPercent(position: number) {
  return `${Math.max(0, Math.min(100, ((position + 1) / 2) * 100))}%`;
}

function rangePositionPercent(position: number, range: "medium" | "narrow") {
  const halfWidth = range === "medium" ? 17 : 9;
  const center = ((position + 1) / 2) * 100;
  return `${Math.max(halfWidth, Math.min(100 - halfWidth, center))}%`;
}

function positionText(axis: ConceptProfileShareAxis, position: number) {
  return position <= -0.25
    ? axis.directionA
    : position >= 0.25
      ? axis.directionB
      : "두 끝점 사이";
}

export function ProfileShareCardPreview({
  model,
}: {
  model: ProfileShareCardModel;
}) {
  if (isConceptShareCard(model)) {
    return (
      <article
        className={`${styles.preview} ${styles.conceptPreview}`}
        aria-label={`${model.nickname}의 3축 겹 공유 카드 미리보기`}
      >
        <header className={styles.conceptHeader}>
          <p>{model.nickname}의 겹</p>
          <span aria-label="범례: 채운 원은 나, 빈 원은 지인">
            ● 나 / ○ 지인
          </span>
        </header>
        <div className={styles.conceptAxes}>
          {model.axes.map((axis, index) => (
            <section
              className={styles.conceptAxis}
              data-axis={index + 1}
              key={`${axis.areaLabel}:${axis.conceptLabel}`}
              aria-label={`${index + 1}번째 축, ${axis.areaLabel}, ${axis.conceptLabel}`}
            >
              <div className={styles.axisHeading}>
                <p>
                  {axis.areaLabel} · 고유 문항 {axis.cardCount}
                </p>
                <h2>{axis.conceptLabel}</h2>
              </div>
              <div className={styles.axisEndpoints} aria-hidden="true">
                <span>{axis.directionA}</span>
                <span>{axis.directionB}</span>
              </div>
              <div className={styles.axisTrack} aria-hidden="true">
                {axis.others.direction === "contextual" ? (
                  <>
                    <span
                      className={styles.othersRange}
                      data-range="split-start"
                    />
                    <span
                      className={styles.othersRange}
                      data-range="split-end"
                    />
                  </>
                ) : (
                  <>
                    <span
                      className={styles.othersRange}
                      data-range={axis.others.range}
                      style={{
                        left: rangePositionPercent(
                          axis.others.position,
                          axis.others.range,
                        ),
                      }}
                    />
                    <span
                      className={styles.othersMarker}
                      style={{
                        left: positionPercent(axis.others.position),
                      }}
                    >
                      ○
                    </span>
                  </>
                )}
                <span
                  className={styles.selfMarker}
                  style={{ left: positionPercent(axis.selfPosition) }}
                >
                  ●
                </span>
              </div>
              <p className={styles.srOnly}>
                {axis.directionA}에서 {axis.directionB} 방향. 내 위치는{" "}
                {positionText(axis, axis.selfPosition)} 쪽. 지인 익명 집계는{" "}
                {axis.others.direction === "contextual"
                  ? "상황에 따라 양쪽 범위"
                  : `${positionText(axis, axis.others.position)} 쪽 익명 범위`}
                . 고유 문항 {axis.cardCount}개.
              </p>
            </section>
          ))}
        </div>
        <strong className={styles.brand}>겹</strong>
      </article>
    );
  }
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
  if (isConceptShareCard(model)) {
    return renderConceptShareCard(
      decodeConceptProfileShareCardModel(model) as ConceptProfileShareCardModel,
    );
  }
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

async function renderConceptShareCard(
  model: ConceptProfileShareCardModel,
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
    [54, "#ff4d42"],
    [36, "#dfff00"],
    [18, "#315cff"],
  ] as const) {
    roundedRect(context, 72 + offset, 100 + offset, 900, 1710, 52);
    context.fillStyle = color;
    context.fill();
  }
  roundedRect(context, 72, 82, 900, 1710, 52);
  context.fillStyle = "#f5f1e9";
  context.fill();

  roundedRect(context, 72, 82, 900, 250, 52);
  context.fillStyle = "#315cff";
  context.fill();
  drawTextBlock(
    context,
    `${model.nickname}의 겹`,
    130,
    130,
    650,
    80,
    58,
    32,
    "#ffffff",
  );
  context.font = '900 34px Pretendard, "Apple SD Gothic Neo", sans-serif';
  context.fillStyle = "#dfff00";
  context.fillText("● 나  /  ○ 지인", 130, 245);

  const cardColors = ["#315cff", "#dfff00", "#ff4d42"] as const;
  const cardY = [390, 815, 1240] as const;
  model.axes.forEach((axis, index) => {
    const y = cardY[index];
    roundedRect(context, 140, y + 18, 790, 350, 34);
    context.fillStyle = "#050505";
    context.fill();
    roundedRect(context, 122, y, 790, 350, 34);
    context.fillStyle = cardColors[index];
    context.fill();

    roundedRect(context, 160, y + 28, 330, 58, 29);
    context.fillStyle = "#050505";
    context.fill();
    drawTextBlock(
      context,
      `${axis.areaLabel} · 고유 문항 ${axis.cardCount}`,
      186,
      y + 41,
      280,
      36,
      28,
      18,
      "#ffffff",
    );
    drawTextBlock(
      context,
      axis.conceptLabel,
      160,
      y + 108,
      710,
      58,
      42,
      24,
      "#050505",
    );
    drawTextBlock(
      context,
      axis.directionA,
      160,
      y + 184,
      285,
      42,
      28,
      16,
      "#050505",
    );
    const right = fittedText(context, axis.directionB, 285, 42, 28, 16);
    context.font = `900 ${right.fontSize}px Pretendard, "Apple SD Gothic Neo", sans-serif`;
    context.fillStyle = "#050505";
    right.lines.forEach((line, lineIndex) => {
      context.fillText(
        line,
        875 - context.measureText(line).width,
        y + 184 + lineIndex * right.lineHeight,
      );
    });

    const startX = 180;
    const endX = 850;
    const trackY = y + 274;
    context.fillStyle = "#050505";
    context.fillRect(startX, trackY, endX - startX, 8);
    if (axis.others.direction === "contextual") {
      context.fillStyle = "#f5f1e9";
      context.fillRect(startX, trackY - 16, 150, 40);
      context.fillRect(endX - 150, trackY - 16, 150, 40);
    } else {
      const othersX =
        startX + ((axis.others.position + 1) / 2) * (endX - startX);
      const rangeWidth = axis.others.range === "medium" ? 190 : 105;
      context.fillStyle = "#f5f1e9";
      context.fillRect(
        Math.max(startX, othersX - rangeWidth / 2),
        trackY - 16,
        Math.min(rangeWidth, endX - Math.max(startX, othersX - rangeWidth / 2)),
        40,
      );
      context.beginPath();
      context.arc(othersX, trackY + 4, 20, 0, Math.PI * 2);
      context.fillStyle = "#f5f1e9";
      context.fill();
      context.lineWidth = 6;
      context.strokeStyle = "#050505";
      context.stroke();
    }
    const selfX = startX + ((axis.selfPosition + 1) / 2) * (endX - startX);
    context.beginPath();
    context.arc(selfX, trackY + 4, 16, 0, Math.PI * 2);
    context.fillStyle = "#050505";
    context.fill();
  });

  context.fillStyle = "#050505";
  context.font = '950 54px Pretendard, "Apple SD Gothic Neo", sans-serif';
  context.fillText("겹", 130, 1702);

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
