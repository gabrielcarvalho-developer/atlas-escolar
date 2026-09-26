import {
  buildMunicipalityMetrics,
  buildSchoolContext,
  DOCUMENT_SOURCES,
  ENEM_AREA_KEYS,
  ENEM_AREA_LABELS,
  type EnemAreaKey,
  INFRA_KEYS,
  INFRA_LABELS,
  MUNICIPALITIES,
  SAEB_STATE,
  type School,
  type SchoolContext,
  SCHOOLS,
  STATE_METRICS,
  type TerritoryMetrics,
} from '@/lib/atlas-data';

export type AssistantConversationTurn = {
  role: 'user' | 'assistant';
  text: string;
};

export type AssistantSelection = {
  analysisLevel?: 'state' | 'municipality' | 'school';
  municipality?: string;
  comparisonMunicipality?: string;
  compareMunicipalities?: boolean;
};

export type AssistantVisualizationTarget =
  | { kind: 'state' }
  | { kind: 'municipality'; municipality: string }
  | { kind: 'school'; schoolCode: string };

export type AssistantVisualization = {
  type: 'infrastructure' | 'performance';
  primary: AssistantVisualizationTarget;
  secondary?: AssistantVisualizationTarget;
};

export type AssistantAnswer = {
  text: string;
  source?: string;
  mode: string;
  visualization?: AssistantVisualization;
  engine?: 'llama' | 'local';
};

type ResolvedTarget =
  | { kind: 'state'; metrics: TerritoryMetrics }
  | { kind: 'municipality'; metrics: TerritoryMetrics }
  | { kind: 'school'; school: School; context: SchoolContext };

type ResolvedTargets = {
  primary: ResolvedTarget;
  secondary?: ResolvedTarget;
};

const RESOURCE_LABELS: Array<
  [keyof SchoolContext['school']['resources'], string]
> = [
  ['water', 'água potável'],
  ['publicEnergy', 'energia da rede pública'],
  ['publicSewage', 'esgoto da rede pública'],
  ['wasteCollection', 'coleta de lixo'],
  ['library', 'biblioteca'],
  ['readingRoom', 'biblioteca/sala de leitura'],
  ['scienceLab', 'laboratório de ciências'],
  ['computerLab', 'laboratório de informática'],
  ['sportsCourt', 'quadra esportiva'],
  ['cafeteria', 'refeitório'],
  ['internet', 'internet'],
  ['studentInternet', 'internet para estudantes'],
  ['learningInternet', 'internet para aprendizagem'],
];

const SCHOOL_SEARCH_STOP_WORDS = new Set([
  'a',
  'ao',
  'campus',
  'centro',
  'colegio',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'educacao',
  'educa',
  'em',
  'ensino',
  'escola',
  'estadual',
  'instituto',
  'municipal',
  'pleno',
  'professor',
  'unidade',
]);

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesPhrase(text: string, phrase: string) {
  return ` ${text} `.includes(` ${phrase} `);
}

function decimal(value: number, digits = 1) {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function integer(value: number) {
  return value.toLocaleString('pt-BR');
}

function participantCount(value: number) {
  return `${integer(value)} ${value === 1 ? 'participante' : 'participantes'}`;
}

function isGreeting(question: string) {
  const normalized = normalize(question);
  return /^(oi|ola|opa|e ai|bom dia|boa tarde|boa noite|tudo bem|como vai)( (atlas|assistente|tudo bem|como vai))?$/.test(
    normalized,
  );
}

function asksForVisualization(question: string) {
  return /\b(grafico|graficos|visualize|visualizacao|visualmente|chart)\b/.test(
    normalize(question),
  );
}

function mentionedMunicipalities(question: string) {
  const normalized = normalize(question);
  return MUNICIPALITIES.filter((municipality) =>
    includesPhrase(normalized, normalize(municipality.name)),
  ).sort((left, right) => right.name.length - left.name.length);
}

function findSchool(question: string, municipalities: string[]) {
  const normalized = normalize(question);
  const code = question.match(/\b\d{8}\b/)?.[0];
  if (code) return SCHOOLS.find((school) => school.code === code);

  const pool = municipalities.length
    ? SCHOOLS.filter((school) => municipalities.includes(school.municipality))
    : SCHOOLS;

  const fullName = pool.find((school) =>
    includesPhrase(normalized, normalize(school.name)),
  );
  if (fullName) return fullName;

  const aliases = ['ifma', 'iema'];
  for (const alias of aliases) {
    if (includesPhrase(normalized, alias)) {
      const match = pool.find((school) =>
        includesPhrase(normalize(school.name), alias),
      );
      if (match) return match;
    }
  }

  const namesASchool =
    /\b(escola|colegio|instituto|campus|centro de ensino|unidade escolar)\b/.test(
      normalized,
    );
  if (!namesASchool || includesPhrase(normalized, 'escolas')) return undefined;

  const questionTokens = new Set(normalized.split(' '));
  const ranked = pool
    .map((school) => {
      const tokens = normalize(school.name)
        .split(' ')
        .filter(
          (token) => token.length > 2 && !SCHOOL_SEARCH_STOP_WORDS.has(token),
        );
      const score = tokens.filter((token) => questionTokens.has(token)).length;
      return { school, score };
    })
    .filter((item) => item.score >= 2)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.school;
}

function stateIsMentioned(question: string) {
  const normalized = normalize(question);
  return (
    /\bmaranh/.test(normalized) ||
    includesPhrase(normalized, 'no estado') ||
    includesPhrase(normalized, 'neste estado') ||
    includesPhrase(normalized, 'do estado')
  );
}

function asStateTarget(): ResolvedTarget {
  return { kind: 'state', metrics: STATE_METRICS };
}

function asMunicipalityTarget(name: string): ResolvedTarget {
  return { kind: 'municipality', metrics: buildMunicipalityMetrics(name) };
}

function asSchoolTarget(school: School): ResolvedTarget {
  return {
    kind: 'school',
    school,
    context: buildSchoolContext(school.code, true),
  };
}

function detectExplicitTargets(question: string): ResolvedTargets | undefined {
  const normalized = normalize(question);
  const municipalities = mentionedMunicipalities(question);
  const municipalityNames = municipalities.map((item) => item.name);
  const school = findSchool(question, municipalityNames);
  const mentionsState = stateIsMentioned(question);
  const compares =
    /\b(compara|comparar|comparacao|versus|vs|diferenca|entre)\b/.test(
      normalized,
    );

  if (school) return { primary: asSchoolTarget(school) };

  if (municipalities.length >= 2) {
    return {
      primary: asMunicipalityTarget(municipalities[0].name),
      secondary: asMunicipalityTarget(municipalities[1].name),
    };
  }

  if (mentionsState && municipalities[0] && compares) {
    return {
      primary: asStateTarget(),
      secondary: asMunicipalityTarget(municipalities[0].name),
    };
  }

  if (municipalities[0]) {
    return { primary: asMunicipalityTarget(municipalities[0].name) };
  }
  if (mentionsState) return { primary: asStateTarget() };
  return undefined;
}

function previousTargets(history: AssistantConversationTurn[]) {
  for (const turn of [...history].reverse()) {
    if (turn.role !== 'user') continue;
    const detected = detectExplicitTargets(turn.text);
    if (detected) return detected;
  }
  return undefined;
}

function resolveTargets(
  question: string,
  context: SchoolContext,
  history: AssistantConversationTurn[],
  selection: AssistantSelection,
): ResolvedTargets {
  const explicit = detectExplicitTargets(question);
  if (explicit) return explicit;

  const normalized = normalize(question);
  if (/\b(nesta|desta|essa|nessa) escola\b/.test(normalized)) {
    return { primary: asSchoolTarget(context.school) };
  }
  if (
    /\b(neste|deste|esse|nesse) municipio\b/.test(normalized) ||
    /\b(nesta|desta|essa|nessa) cidade\b/.test(normalized)
  ) {
    return {
      primary: asMunicipalityTarget(
        selection.municipality ?? context.school.municipality,
      ),
    };
  }

  const followUp =
    /^(e |e$|e quanto|e quantos|qual|quais|quanto|quantos|tambem)|\b(la|dele|dela|nesse caso|nessa localidade)\b/.test(
      normalized,
    );
  if (followUp) {
    const previous = previousTargets(history);
    if (previous) return previous;
  }

  if (selection.analysisLevel === 'state') return { primary: asStateTarget() };
  if (selection.analysisLevel === 'municipality') {
    const primary = asMunicipalityTarget(
      selection.municipality ?? context.school.municipality,
    );
    const secondary =
      selection.compareMunicipalities && selection.comparisonMunicipality
        ? asMunicipalityTarget(selection.comparisonMunicipality)
        : undefined;
    return { primary, secondary };
  }
  return { primary: asSchoolTarget(context.school) };
}

function targetLabel(target: ResolvedTarget) {
  if (target.kind === 'school') return target.school.name;
  return target.metrics.name;
}

function targetLocation(target: ResolvedTarget) {
  if (target.kind === 'school') return `na escola ${target.school.name}`;
  if (target.kind === 'municipality') return `em ${target.metrics.name}`;
  return 'no Maranhão';
}

function targetRecords(target: ResolvedTarget) {
  return target.kind === 'school'
    ? target.school.records
    : target.metrics.enemRecords;
}

function targetParticipants(target: ResolvedTarget, area: EnemAreaKey) {
  return target.kind === 'school'
    ? target.school.participants[area]
    : target.metrics.participants[area];
}

function targetAverage(target: ResolvedTarget, area: EnemAreaKey) {
  return target.kind === 'school'
    ? target.school.averages[area]
    : target.metrics.averages[area];
}

function targetInfrastructure(target: ResolvedTarget) {
  return target.kind === 'school'
    ? target.school.infrastructure
    : target.metrics.infrastructure;
}

function visualizationTarget(
  target: ResolvedTarget,
): AssistantVisualizationTarget {
  if (target.kind === 'school') {
    return { kind: 'school', schoolCode: target.school.code };
  }
  if (target.kind === 'municipality') {
    return { kind: 'municipality', municipality: target.metrics.name };
  }
  return { kind: 'state' };
}

function visualization(
  type: AssistantVisualization['type'],
  targets: ResolvedTargets,
  question: string,
) {
  if (!asksForVisualization(question)) return undefined;
  return {
    type,
    primary: visualizationTarget(targets.primary),
    secondary: targets.secondary
      ? visualizationTarget(targets.secondary)
      : undefined,
  } satisfies AssistantVisualization;
}

function areaFromQuestion(question: string): EnemAreaKey | undefined {
  const normalized = normalize(question);
  if (/\b(redacao|texto)\b/.test(normalized)) return 'essay';
  if (/\b(matematica|matematica|mt)\b/.test(normalized)) return 'mt';
  if (/\b(natureza|ciencias da natureza|cn)\b/.test(normalized)) return 'cn';
  if (/\b(humanas|ciencias humanas|ch)\b/.test(normalized)) return 'ch';
  if (/\b(linguagens|linguagem|codigos|lc)\b/.test(normalized)) return 'lc';
  return undefined;
}

function asksForAirConditionerCount(question: string) {
  const normalized = normalize(question);
  const mentionsAirConditioningEquipment =
    /\b(?:ar condicionad[oa]s?|ares condicionados?|aparelhos?(?: de)? ar condicionad[oa]s?|equipamentos? de (?:ar condicionado|climatizacao))\b/.test(
      normalized,
    );
  const asksForQuantity =
    /\b(quantos|quantas|quantidade|numero|total|existem|possui|possuem|tem|ha)\b/.test(
      normalized,
    );

  return mentionsAirConditioningEquipment && asksForQuantity;
}

function answerUnavailableAirConditionerCount(
  target: ResolvedTarget,
): AssistantAnswer {
  return {
    text: `A base do Atlas **não informa a quantidade de aparelhos de ar-condicionado ${targetLocation(target)}**. Ela registra apenas a quantidade de salas utilizadas climatizadas por escola, no campo \`QT_SALAS_UTILIZA_CLIMATIZADAS\`. Esse indicador não permite calcular quantos aparelhos existem; portanto, não tenho dados para responder essa quantidade.`,
    source:
      'Censo Escolar 2025 · campo QT_SALAS_UTILIZA_CLIMATIZADAS; sem campo de quantidade de aparelhos',
    mode: 'limite da base',
    engine: 'local',
  };
}

function answerEnemCount(
  targets: ResolvedTargets,
  area: EnemAreaKey | undefined,
): AssistantAnswer {
  const values = [targets.primary, targets.secondary].filter(
    (target): target is ResolvedTarget => Boolean(target),
  );

  if (area) {
    const lines = values.map(
      (target) =>
        `• **${targetLabel(target)}:** ${participantCount(targetParticipants(target, area))}`,
    );
    return {
      text: `${values.length > 1 ? `Participação em ${ENEM_AREA_LABELS[area]} no ENEM 2025:` : `A base registra **${participantCount(targetParticipants(targets.primary, area))}** com nota válida em ${ENEM_AREA_LABELS[area]} ${targetLocation(targets.primary)}.`}${values.length > 1 ? `\n\n${lines.join('\n')}` : ''}\n\nA contagem é específica dessa área e pode diferir do total de registros do ENEM.`,
      source: 'ENEM 2025 · participantes presentes com nota válida por área',
      mode: 'consulta calculada da base',
      engine: 'local',
    };
  }

  if (values.length > 1) {
    const first = targetRecords(values[0]);
    const second = targetRecords(values[1]);
    const difference = Math.abs(first - second);
    return {
      text: `Registros de candidatos do ENEM 2025:\n\n• **${targetLabel(values[0])}: ${integer(first)}**\n• **${targetLabel(values[1])}: ${integer(second)}**\n\nA diferença é de **${integer(difference)} registro(s)**, com ${first === second ? 'os dois recortes no mesmo total' : `maior quantidade em **${targetLabel(first > second ? values[0] : values[1])}**`}.`,
      source: 'ENEM 2025 · campo QTD_REGISTROS da agregação correspondente',
      mode: 'comparação calculada da base',
      engine: 'local',
    };
  }

  const total = targetRecords(targets.primary);
  return {
    text: `A base do Atlas registra **${integer(total)} candidatos/registros do ENEM 2025 ${targetLocation(targets.primary)}**.\n\nEsse total vem do campo de registros da agregação correspondente. Ele não deve ser confundido com a soma de presenças nas áreas, pois cada prova possui sua própria contagem de participantes válidos.`,
    source: 'ENEM 2025 · campo QTD_REGISTROS da agregação correspondente',
    mode: 'consulta direta da base',
    engine: 'local',
  };
}

function answerSchoolCount(
  target: ResolvedTarget,
  normalized: string,
): AssistantAnswer {
  if (target.kind === 'school') {
    return {
      text: `A pergunta já está no nível da escola **${target.school.name}**. Posso informar os registros do ENEM, participantes por área, médias e infraestrutura dessa unidade.`,
      source: DOCUMENT_SOURCES.school,
      mode: 'orientação de escopo',
      engine: 'local',
    };
  }

  const metrics = target.metrics;
  const asksHighSchool = includesPhrase(normalized, 'ensino medio');
  const asksEnemSchools =
    /\b(com dados do enem|participaram do enem|no enem)\b/.test(normalized);
  const value = asksHighSchool
    ? metrics.highSchoolCount
    : asksEnemSchools
      ? metrics.enemSchoolCount
      : metrics.schoolCount;
  const description = asksHighSchool
    ? 'escolas públicas com Ensino Médio'
    : asksEnemSchools
      ? 'escolas com registros do ENEM'
      : 'escolas públicas';

  return {
    text: `A base registra **${integer(value)} ${description} ${targetLocation(target)}**.`,
    source: asksEnemSchools
      ? DOCUMENT_SOURCES.municipality
      : 'Censo Escolar 2025 · agregação territorial',
    mode: 'consulta direta da base',
    engine: 'local',
  };
}

function answerPerformance(
  question: string,
  targets: ResolvedTargets,
  area: EnemAreaKey | undefined,
): AssistantAnswer {
  const values = [targets.primary, targets.secondary].filter(
    (target): target is ResolvedTarget => Boolean(target),
  );
  const areas = area ? [area] : ENEM_AREA_KEYS;
  const blocks = values.map((target) => {
    const lines = areas.map((key) => {
      const value = targetAverage(target, key);
      const average = value === null ? 'sem dado' : `${decimal(value)} pontos`;
      return `• ${ENEM_AREA_LABELS[key]}: **${average}** (${participantCount(targetParticipants(target, key))})`;
    });
    return `${values.length > 1 ? `**${targetLabel(target)}**\n` : ''}${lines.join('\n')}`;
  });

  return {
    text: `${area ? `Média de ${ENEM_AREA_LABELS[area]} no ENEM 2025` : 'Médias do ENEM 2025'} ${values.length === 1 ? targetLocation(values[0]) : 'nos recortes comparados'}:\n\n${blocks.join('\n\n')}\n\nAs médias são acompanhadas da quantidade de participantes válidos; resultados com menos de 30 participantes exigem cautela.`,
    source: 'ENEM 2025 · médias e participantes por área',
    mode:
      values.length > 1
        ? 'comparação calculada da base'
        : 'leitura refinada da base',
    visualization: visualization('performance', targets, question),
    engine: 'local',
  };
}

function answerInfrastructure(
  question: string,
  targets: ResolvedTargets,
): AssistantAnswer {
  const values = [targets.primary, targets.secondary].filter(
    (target): target is ResolvedTarget => Boolean(target),
  );
  const blocks = values.map((target) => {
    const infrastructure = targetInfrastructure(target);
    const lowest = INFRA_KEYS.reduce((current, key) =>
      infrastructure[key] < infrastructure[current] ? key : current,
    );
    const lines = INFRA_KEYS.map(
      (key) =>
        `• ${INFRA_LABELS[key]}: **${decimal(infrastructure[key] * 10)}%**`,
    );
    return `${values.length > 1 ? `**${targetLabel(target)}**\n` : ''}${lines.join('\n')}\nMenor índice: **${INFRA_LABELS[lowest]} (${decimal(infrastructure[lowest] * 10)}%)**.`;
  });

  return {
    text: `Infraestrutura ${values.length > 1 ? 'nos recortes comparados' : targetLocation(values[0])}:\n\n${blocks.join('\n\n')}\n\nOs percentuais são indicadores compostos do Censo Escolar e devem ser usados como triagem.`,
    source: 'Censo Escolar 2025 · indicadores compostos de infraestrutura',
    mode:
      values.length > 1 ? 'comparação calculada da base' : 'cálculo auditável',
    visualization: visualization('infrastructure', targets, question),
    engine: 'local',
  };
}

function answerResources(target: ResolvedTarget): AssistantAnswer {
  if (target.kind !== 'school') {
    return {
      text: `Os recursos binários, como biblioteca, laboratório e internet, estão disponíveis por escola. Para **${targetLabel(target)}**, posso apresentar os percentuais agregados de infraestrutura ou listar as escolas identificadas.`,
      source: 'Censo Escolar 2025 · limite de granularidade',
      mode: 'orientação de escopo',
      engine: 'local',
    };
  }

  const missing = RESOURCE_LABELS.filter(
    ([key]) => target.school.resources[key] === false,
  ).map(([, label]) => label);
  return {
    text: missing.length
      ? `Segundo o Censo Escolar, não estão registrados em **${target.school.name}**: **${missing.join(', ')}**.\n\nA escola tem **${integer(target.school.resources.totalDevices)} dispositivo(s) para estudantes** e ${target.school.resources.broadband === null ? 'não possui informação válida sobre banda larga' : target.school.resources.broadband ? 'possui banda larga' : 'não possui banda larga'}.`
      : `Não há ausência registrada nos recursos binários acompanhados para **${target.school.name}**. A escola tem **${integer(target.school.resources.totalDevices)} dispositivo(s) para estudantes**.`,
    source: `${DOCUMENT_SOURCES.school} · indicadores IN_* e QT_*`,
    mode: 'leitura direta da base',
    engine: 'local',
  };
}

function answerSchoolList(target: ResolvedTarget): AssistantAnswer {
  if (target.kind !== 'municipality') {
    return {
      text: 'Para listar escolas, indique um município — por exemplo: **“Quais escolas de Coelho Neto têm registros do ENEM?”**',
      source: DOCUMENT_SOURCES.school,
      mode: 'pedido de recorte',
      engine: 'local',
    };
  }

  const schools = SCHOOLS.filter(
    (school) => school.municipality === target.metrics.name,
  );
  if (!schools.length) {
    return {
      text: `Não encontrei escolas identificadas na base escolar do ENEM para **${target.metrics.name}**.`,
      source: DOCUMENT_SOURCES.school,
      mode: 'consulta direta da base',
      engine: 'local',
    };
  }

  const lines = schools.map(
    (school) => `• **${school.name}** — ${integer(school.records)} registro(s)`,
  );
  return {
    text: `Encontrei **${integer(schools.length)} escola(s) identificada(s)** em ${target.metrics.name}:\n\n${lines.join('\n')}\n\nA lista inclui apenas escolas vinculadas entre as bases do ENEM e do Censo Escolar.`,
    source: DOCUMENT_SOURCES.school,
    mode: 'busca na base escolar',
    engine: 'local',
  };
}

function answerCoverage(targets: ResolvedTargets): AssistantAnswer {
  const values = [targets.primary, targets.secondary].filter(
    (target): target is ResolvedTarget => Boolean(target),
  );
  const lines = values.map((target) => {
    if (target.kind === 'school') {
      return `• **${target.school.name}:** escola identificada e vinculada ao Censo Escolar`;
    }
    return `• **${target.metrics.name}: ${decimal(target.metrics.linkedCoveragePercentage)}%** (${integer(target.metrics.linkedEnemSchoolCount)} escolas vinculadas)`;
  });
  return {
    text: `Cobertura da vinculação ENEM–Censo:\n\n${lines.join('\n')}`,
    source: 'ENEM e Censo Escolar 2025 · cobertura de vinculação',
    mode: 'consulta calculada da base',
    engine: 'local',
  };
}

function summarizeTarget(target: ResolvedTarget): AssistantAnswer {
  if (target.kind === 'school') {
    const critical =
      target.context.school.infrastructure[target.context.criticalFactor] * 10;
    return {
      text: `A escola **${target.school.name}**, em ${target.school.municipality}, possui **${integer(target.school.records)} registros do ENEM 2025**. Seu menor índice composto de infraestrutura é **${target.context.criticalFactorName} (${decimal(critical)}%)**.\n\nPosso detalhar participantes, médias, recursos, infraestrutura ou comparar a escola com o município.`,
      source: 'ENEM e Censo Escolar 2025 · base escolar identificada',
      mode: 'síntese do recorte',
      engine: 'local',
    };
  }

  return {
    text: `Resumo de **${target.metrics.name}**:\n\n• ${integer(target.metrics.schoolCount)} escolas públicas\n• ${integer(target.metrics.highSchoolCount)} escolas com Ensino Médio\n• ${integer(target.metrics.enemRecords)} registros do ENEM 2025\n• ${decimal(target.metrics.linkedCoveragePercentage)}% de cobertura identificada\n\nPosso calcular participantes por área, médias, infraestrutura, cobertura ou comparar esse recorte com outro município.`,
    source: 'Censo Escolar e ENEM 2025 · agregação territorial',
    mode: 'síntese do recorte',
    engine: 'local',
  };
}

export function answerQuestionLocally(
  question: string,
  context: SchoolContext,
  history: AssistantConversationTurn[] = [],
  selection: AssistantSelection = {},
): AssistantAnswer {
  const normalized = normalize(question);
  const targets = resolveTargets(question, context, history, selection);
  const area = areaFromQuestion(question);

  if (isGreeting(question)) {
    return {
      text: `Olá! Sou o Assistente Atlas Escolar. Posso consultar e calcular informações da base para o **Maranhão, seus municípios e escolas identificadas**.\n\nVocê pode perguntar, por exemplo, quantos registros do ENEM existem no estado, em uma cidade ou em uma escola específica.`,
      mode: 'saudação',
      engine: 'local',
    };
  }

  if (includesPhrase(normalized, 'saeb')) {
    const lines = SAEB_STATE.map(
      (row) =>
        `${row.ETAPA}: LP ${decimal(row.MEDIA_LP_PONDERADA_PRESENTES ?? 0)} e MT ${decimal(row.MEDIA_MT_PONDERADA_PRESENTES ?? 0)}`,
    ).join('; ');
    return {
      text: `O SAEB disponível é **contexto estadual do Maranhão**. Médias ponderadas por presentes: ${lines}.\n\nOs identificadores de escola e município estão mascarados na origem; por isso, esses resultados não podem ser atribuídos a uma escola ou cidade específica.`,
      source: DOCUMENT_SOURCES.saeb,
      mode: 'contexto estadual',
      engine: 'local',
    };
  }

  if (asksForAirConditionerCount(question)) {
    return answerUnavailableAirConditionerCount(targets.primary);
  }

  const asksSchoolList =
    /\b(quais|liste|listar|lista)\b/.test(normalized) &&
    includesPhrase(normalized, 'escolas');
  if (asksSchoolList) return answerSchoolList(targets.primary);

  const asksSchoolCount =
    /\b(quantas|quantidade|numero|total)\b/.test(normalized) &&
    includesPhrase(normalized, 'escolas');
  if (asksSchoolCount) return answerSchoolCount(targets.primary, normalized);

  const asksEnemCount =
    includesPhrase(normalized, 'enem') &&
    (/\b(quantos|quantas|quantidade|numero|total|fizeram|participaram|presentes|registros|candidatos|alunos|estudantes)\b/.test(
      normalized,
    ) ||
      normalized.startsWith('quanto'));
  if (asksEnemCount) return answerEnemCount(targets, area);

  if (
    /\b(media|medias|nota|notas|desempenho|resultado|resultados)\b/.test(
      normalized,
    ) &&
    !/\b(infraestrutura|infra|gargalo|conectividade|acessibilidade)\b/.test(
      normalized,
    )
  ) {
    return answerPerformance(question, targets, area);
  }

  if (
    /\b(infraestrutura|infra|gargalo|conectividade|acessibilidade)\b/.test(
      normalized,
    )
  ) {
    return answerInfrastructure(question, targets);
  }

  if (/\b(recurso|recursos|ausente|ausentes|falta|faltam)\b/.test(normalized)) {
    return answerResources(targets.primary);
  }

  if (/\b(cobertura|vinculacao|vinculadas|identificadas)\b/.test(normalized)) {
    return answerCoverage(targets);
  }

  if (/\b(socioeconomico|socioeconomica|inse)\b/.test(normalized)) {
    return {
      text: 'A entrega atual **não contém INSE escolar**. O SAEB possui categorias estaduais de nível socioeconômico, mas os identificadores estão mascarados e não podem ser associados a escolas ou municípios.',
      source: `${DOCUMENT_SOURCES.dictionary} · regra global do SAEB`,
      mode: 'limite metodológico',
      engine: 'local',
    };
  }

  return summarizeTarget(targets.primary);
}

function targetSnapshot(target: ResolvedTarget) {
  if (target.kind === 'school') {
    return {
      kind: target.kind,
      code: target.school.code,
      name: target.school.name,
      municipality: target.school.municipality,
      dependency: target.school.dependency,
      location: target.school.location,
      enemRecords: target.school.records,
      participants: target.school.participants,
      averages: target.school.averages,
      infrastructure: target.school.infrastructure,
      resources: target.school.resources,
    };
  }
  return {
    kind: target.kind,
    name: target.metrics.name,
    schoolCount: target.metrics.schoolCount,
    highSchoolCount: target.metrics.highSchoolCount,
    enemRecords: target.metrics.enemRecords,
    enemSchoolCount: target.metrics.enemSchoolCount,
    linkedCoveragePercentage: target.metrics.linkedCoveragePercentage,
    participants: target.metrics.participants,
    averages: target.metrics.averages,
    infrastructure: target.metrics.infrastructure,
  };
}

export function buildAssistantGrounding(
  context: SchoolContext,
  question = '',
  history: AssistantConversationTurn[] = [],
  selection: AssistantSelection = {},
) {
  const targets = resolveTargets(question, context, history, selection);
  return {
    resolvedTargets: {
      primary: targetSnapshot(targets.primary),
      secondary: targets.secondary
        ? targetSnapshot(targets.secondary)
        : undefined,
    },
    selectedContext: {
      analysisLevel: selection.analysisLevel ?? 'school',
      school: context.school.name,
      municipality: selection.municipality ?? context.school.municipality,
    },
    saebState: SAEB_STATE,
    methodology: {
      lowSampleThreshold: 30,
      caveats: [
        'QTD_REGISTROS representa candidatos/registros e não a soma de presenças por área.',
        'O SAEB é somente contexto estadual; não associar seus resultados à escola ou ao município.',
        'QT_SALAS_UTILIZA_CLIMATIZADAS representa salas climatizadas, não a quantidade de aparelhos de ar-condicionado.',
        'Não inferir causalidade.',
        'Não há INSE escolar nesta entrega.',
        'Médias do ENEM devem ser lidas com a contagem de participantes da área.',
      ],
      sources: DOCUMENT_SOURCES,
    },
  };
}
