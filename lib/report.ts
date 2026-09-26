import type { SchoolContext } from '@/lib/atlas-data';
import { INFRA_KEYS, INFRA_SHORT_LABELS } from '@/lib/atlas-data';

type Color = [number, number, number];

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

const COLORS = {
  navy: [0.08, 0.18, 0.22] as Color,
  navySoft: [0.12, 0.25, 0.29] as Color,
  teal: [0.03, 0.49, 0.44] as Color,
  tealDark: [0.02, 0.38, 0.34] as Color,
  lime: [0.8, 0.94, 0.41] as Color,
  ink: [0.08, 0.15, 0.18] as Color,
  muted: [0.36, 0.43, 0.46] as Color,
  canvas: [0.95, 0.97, 0.95] as Color,
  softTeal: [0.88, 0.95, 0.93] as Color,
  softLime: [0.93, 0.96, 0.79] as Color,
  warm: [0.96, 0.91, 0.76] as Color,
  warmInk: [0.46, 0.35, 0.12] as Color,
  white: [1, 1, 1] as Color,
  line: [0.84, 0.88, 0.85] as Color,
  lineStrong: [0.73, 0.79, 0.75] as Color,
  municipal: [0.71, 0.75, 0.72] as Color,
};

function safeText(value: string) {
  return value
    .replace(/[–—]/g, '-')
    .replace(/•/g, '-')
    .replace(/[^ -~ -ÿ]/g, '');
}

function pdfEscape(value: string) {
  return safeText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function color([red, green, blue]: Color) {
  return `${red} ${green} ${blue}`;
}

function wrapText(value: string, maxCharacters: number) {
  const words = value.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxCharacters) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function latin1Bytes(value: string) {
  return Uint8Array.from(value, (character) => character.charCodeAt(0) & 0xff);
}

function pdfUtf16Hex(value: string) {
  const units = ['FEFF'];
  for (let index = 0; index < value.length; index += 1) {
    units.push(value.charCodeAt(index).toString(16).padStart(4, '0'));
  }
  return `<${units.join('').toUpperCase()}>`;
}

function formatNumber(value: number | null, maximumFractionDigits = 1) {
  return value === null
    ? 'Sem dado'
    : value.toLocaleString('pt-BR', { maximumFractionDigits });
}

function formatPercentage(value: number) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function createDrawing(commands: string[]) {
  const rect = (
    x: number,
    y: number,
    width: number,
    height: number,
    fill: Color,
  ) => {
    commands.push(`${color(fill)} rg ${x} ${y} ${width} ${height} re f`);
  };

  const strokeRect = (
    x: number,
    y: number,
    width: number,
    height: number,
    stroke: Color,
    lineWidth = 0.7,
  ) => {
    commands.push(
      `${color(stroke)} RG ${lineWidth} w ${x} ${y} ${width} ${height} re S`,
    );
  };

  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    stroke: Color,
    width = 1,
  ) => {
    commands.push(
      `${color(stroke)} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`,
    );
  };

  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    fill: Color = COLORS.ink,
    bold = false,
  ) => {
    commands.push(
      `${color(fill)} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfEscape(value)}) Tj ET`,
    );
  };

  const paragraph = (
    value: string,
    x: number,
    y: number,
    maxCharacters: number,
    size: number,
    fill: Color = COLORS.muted,
    leading = 14,
    maxLines = 3,
  ) => {
    const lines = wrapText(value, maxCharacters).slice(0, maxLines);
    lines.forEach((item, index) =>
      text(item, x, y - index * leading, size, fill),
    );
    return lines.length;
  };

  return { rect, strokeRect, line, text, paragraph };
}

export function buildReport(context: SchoolContext) {
  const lowestArea = context.lowestPerformanceArea;
  const criticalSchool =
    context.school.infrastructure[context.criticalFactor] * 10;
  const criticalMunicipal =
    context.municipalInfrastructure[context.criticalFactor] * 10;
  const pages: string[][] = [[], []];

  const drawFooter = (
    drawing: ReturnType<typeof createDrawing>,
    pageNumber: number,
  ) => {
    const { line, text } = drawing;
    line(42, 54, 553, 54, COLORS.line, 0.7);
    text(
      'Censo Escolar 2025  |  ENEM 2025  |  SAEB 2023',
      42,
      34,
      7.5,
      COLORS.muted,
    );
    text(`ATLAS  |  ${pageNumber} / 2`, 500, 34, 7.5, COLORS.muted, true);
  };

  {
    const drawing = createDrawing(pages[0]);
    const { rect, strokeRect, line, text, paragraph } = drawing;

    rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, COLORS.canvas);
    rect(0, 622, PAGE_WIDTH, 220, COLORS.navy);
    rect(42, 790, 30, 30, COLORS.lime);
    text('A', 52.5, 800, 12, COLORS.navy, true);
    text('Atlas', 82, 805, 13, COLORS.white, true);
    text('INTELIGÊNCIA EDUCACIONAL', 82, 793, 6.8, [0.66, 0.74, 0.75]);
    text('DIAGNÓSTICO  |  2025', 451, 801, 7.5, COLORS.lime, true);

    text('RELATÓRIO DIAGNÓSTICO', 42, 758, 8, COLORS.lime, true);
    text('Prioridades para decisão', 42, 718, 28, COLORS.white, true);
    paragraph(
      context.school.name,
      42,
      678,
      58,
      12,
      COLORS.white,
      15,
      2,
    );
    text(
      `${context.school.municipality}/${context.school.state}  |  Código ${context.school.code}  |  ${context.school.dependency} - ${context.school.location}`,
      42,
      636,
      8,
      [0.68, 0.75, 0.76],
    );

    text('LEITURA RÁPIDA', 42, 591, 8, COLORS.tealDark, true);
    text(
      'Os indicadores essenciais da escola em um único olhar.',
      42,
      576,
      8.5,
      COLORS.muted,
    );

    const metrics = [
      {
        label: 'Infraestrutura',
        value: formatPercentage(context.infrastructureScore * 10),
        accent: COLORS.teal,
      },
      {
        label: 'Conectividade',
        value: formatPercentage(context.connectivityScore * 10),
        accent: COLORS.teal,
      },
      {
        label: 'Registros ENEM',
        value: context.school.records.toLocaleString('pt-BR'),
        accent: COLORS.lime,
      },
    ];

    metrics.forEach((metric, index) => {
      const x = 42 + index * 173;
      rect(x, 493, 164, 66, COLORS.white);
      strokeRect(x, 493, 164, 66, COLORS.line);
      rect(x, 555, 164, 4, metric.accent);
      text(metric.label.toUpperCase(), x + 15, 536, 7, COLORS.muted, true);
      text(metric.value, x + 15, 508, 20, COLORS.ink, true);
    });

    text('PRIORIDADES', 42, 458, 8, COLORS.tealDark, true);
    text('O que precisa melhorar primeiro', 42, 435, 17, COLORS.ink, true);
    text(
      'Sinais ordenados para apoiar a conversa e o planejamento da equipe.',
      42,
      420,
      8.5,
      COLORS.muted,
    );

    const improvementCard = (
      y: number,
      number: string,
      category: string,
      title: string,
      description: string,
      reference: string,
    ) => {
      rect(42, y, 511, 108, COLORS.white);
      strokeRect(42, y, 511, 108, COLORS.line);
      rect(42, y, 5, 108, COLORS.teal);
      rect(60, y + 57, 34, 34, COLORS.softTeal);
      text(number, 69, y + 69, 10, COLORS.tealDark, true);
      text(category.toUpperCase(), 108, y + 85, 7, COLORS.tealDark, true);
      text(title, 108, y + 62, 15, COLORS.ink, true);
      paragraph(description, 108, y + 43, 70, 8.8, COLORS.muted, 12, 2);
      line(108, y + 23, 535, y + 23, COLORS.line, 0.6);
      text(reference, 108, y + 9, 8, COLORS.tealDark, true);
    };

    improvementCard(
      294,
      '01',
      'Infraestrutura',
      context.criticalFactorName,
      `Menor índice composto da escola: ${formatPercentage(criticalSchool)}.`,
      `Referência municipal: ${formatPercentage(criticalMunicipal)}`,
    );
    improvementCard(
      170,
      '02',
      'Desempenho e cobertura',
      lowestArea?.label ?? 'Cobertura dos dados do ENEM',
      lowestArea
        ? `Menor média válida da escola: ${formatNumber(lowestArea.schoolAverage)} pontos.`
        : 'Não há média válida por área para esta escola na entrega atual.',
      lowestArea
        ? `Município: ${formatNumber(lowestArea.municipalAverage)} pontos  |  Amostra: ${lowestArea.schoolParticipants} ${lowestArea.schoolParticipants === 1 ? 'participante' : 'participantes'}`
        : 'Verificar a disponibilidade e a cobertura antes da análise.',
    );

    const cautionText = context.lowSampleAreas.length
      ? `${context.lowSampleAreas.length} área(s) do ENEM têm menos de 30 participantes. Trate essas médias como sinais exploratórios e confirme as evidências com a escola.`
      : 'As áreas do ENEM têm amostras com 30 ou mais participantes. Ainda assim, use os resultados como sinais descritivos e confirme as evidências com a escola.';
    rect(42, 82, 511, 66, COLORS.softLime);
    rect(42, 82, 5, 66, COLORS.lime);
    text('LEITURA RESPONSÁVEL', 60, 126, 7.5, COLORS.navy, true);
    paragraph(cautionText, 60, 108, 91, 8, COLORS.ink, 11, 3);

    drawFooter(drawing, 1);
  }

  {
    const drawing = createDrawing(pages[1]);
    const { rect, strokeRect, line, text, paragraph } = drawing;

    rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, COLORS.canvas);
    rect(0, 782, PAGE_WIDTH, 60, COLORS.white);
    line(0, 782, PAGE_WIDTH, 782, COLORS.line, 0.7);
    rect(42, 798, 26, 26, COLORS.navy);
    text('A', 51, 807, 10, COLORS.lime, true);
    text('Atlas', 77, 810, 11, COLORS.ink, true);
    text('EVIDÊNCIAS DO DIAGNÓSTICO', 380, 808, 7.5, COLORS.muted, true);

    text('Evidências do diagnóstico', 42, 745, 24, COLORS.ink, true);
    paragraph(
      'Comparação da escola com a referência municipal e indicação da cobertura dos dados.',
      42,
      724,
      88,
      8.5,
      COLORS.muted,
      12,
      2,
    );

    rect(42, 420, 511, 280, COLORS.white);
    strokeRect(42, 420, 511, 280, COLORS.line);
    rect(42, 696, 511, 4, COLORS.teal);
    text('INFRAESTRUTURA', 60, 674, 7.5, COLORS.tealDark, true);
    text('Composição por dimensão', 60, 653, 15, COLORS.ink, true);
    rect(354, 655, 7, 7, COLORS.teal);
    text('Escola', 366, 654, 7.5, COLORS.muted);
    line(426, 659, 438, 659, COLORS.municipal, 1.5);
    text('Município', 444, 654, 7.5, COLORS.muted);

    INFRA_KEYS.forEach((key, index) => {
      const y = 617 - index * 43;
      const schoolValue = context.school.infrastructure[key] * 10;
      const municipalValue = context.municipalInfrastructure[key] * 10;
      const barX = 186;
      const barWidth = 240;
      const schoolWidth = Math.max(2, (Math.min(100, schoolValue) / 100) * barWidth);
      const municipalX =
        barX + (Math.min(100, municipalValue) / 100) * barWidth;

      text(INFRA_SHORT_LABELS[key], 60, y + 1, 8.5, COLORS.ink, true);
      rect(barX, y - 1, barWidth, 7, COLORS.canvas);
      rect(barX, y - 1, schoolWidth, 7, COLORS.teal);
      line(municipalX, y - 4, municipalX, y + 9, COLORS.municipal, 1.4);
      text(formatPercentage(schoolValue), 442, y, 8, COLORS.ink, true);
      text(formatPercentage(municipalValue), 500, y, 7.5, COLORS.muted);

      if (index < INFRA_KEYS.length - 1) {
        line(60, y - 20, 535, y - 20, COLORS.line, 0.45);
      }
    });

    rect(42, 144, 511, 252, COLORS.white);
    strokeRect(42, 144, 511, 252, COLORS.line);
    rect(42, 392, 511, 4, COLORS.lime);
    text('ENEM 2025', 60, 370, 7.5, COLORS.tealDark, true);
    text('Desempenho e cobertura', 60, 349, 15, COLORS.ink, true);

    rect(60, 316, 475, 21, COLORS.navy);
    text('ÁREA', 70, 323, 7, COLORS.white, true);
    text('ESCOLA', 249, 323, 7, COLORS.white, true);
    text('MUNICÍPIO', 324, 323, 7, COLORS.white, true);
    text('AMOSTRA', 407, 323, 7, COLORS.white, true);
    text('COBERTURA', 474, 323, 7, COLORS.white, true);

    context.performanceAreas.forEach((area, index) => {
      const rowY = 286 - index * 31;
      if (index % 2 === 0) rect(60, rowY - 8, 475, 28, COLORS.canvas);
      text(area.label, 70, rowY + 2, 8, COLORS.ink, true);
      text(formatNumber(area.schoolAverage), 249, rowY + 2, 8, COLORS.ink);
      text(formatNumber(area.municipalAverage), 324, rowY + 2, 8, COLORS.muted);
      text(area.schoolParticipants.toLocaleString('pt-BR'), 407, rowY + 2, 8, COLORS.ink);

      const lowSample = area.schoolParticipants < 30;
      rect(474, rowY - 4, 7, 7, lowSample ? COLORS.warm : COLORS.softTeal);
      text(
        lowSample ? 'Reduzida' : 'Adequada',
        486,
        rowY + 1,
        7.2,
        lowSample ? COLORS.warmInk : COLORS.tealDark,
        true,
      );
    });

    rect(42, 76, 511, 48, COLORS.softTeal);
    text('NOTA METODOLÓGICA', 58, 106, 7.2, COLORS.tealDark, true);
    paragraph(
      'Resultados descritivos não demonstram causalidade. A comparação municipal é uma referência contextual; o SAEB disponível representa o contexto estadual do Maranhão.',
      58,
      91,
      98,
      7.5,
      COLORS.ink,
      10,
      2,
    );

    drawFooter(drawing, 2);
  }

  const streams = pages.map((commands) => commands.join('\n'));
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /PageLayout /OneColumn >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 8 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${streams[0].length} >>\nstream\n${streams[0]}\nendstream`,
    `<< /Length ${streams[1].length} >>\nstream\n${streams[1]}\nendstream`,
    `<< /Title ${pdfUtf16Hex(`Diagnóstico Atlas - ${context.school.name}`)} /Author (Atlas) /Subject ${pdfUtf16Hex('Diagnóstico escolar orientado por evidências')} /Creator ${pdfUtf16Hex('Atlas Inteligência Educacional')} >>`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 9 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return {
    blob: new Blob([latin1Bytes(pdf)], { type: 'application/pdf' }),
    filename: `diagnostico_atlas_${slugify(context.school.name)}.pdf`,
  };
}
