import generatedData from '@/lib/generated/atlas-real-data.json';

export const INFRA_KEYS = [
  'basicServices',
  'learningSpaces',
  'connectivity',
  'accessibility',
  'climate',
] as const;

export type InfraKey = (typeof INFRA_KEYS)[number];

export const INFRA_LABELS: Record<InfraKey, string> = {
  basicServices: 'Serviços básicos',
  learningSpaces: 'Espaços escolares',
  connectivity: 'Conectividade',
  accessibility: 'Acessibilidade',
  climate: 'Salas climatizadas',
};

export const INFRA_SHORT_LABELS: Record<InfraKey, string> = {
  basicServices: 'Serviços',
  learningSpaces: 'Espaços',
  connectivity: 'Conectividade',
  accessibility: 'Acessibilidade',
  climate: 'Climatização',
};

export const ENEM_AREA_KEYS = ['cn', 'ch', 'lc', 'mt', 'essay'] as const;
export type EnemAreaKey = (typeof ENEM_AREA_KEYS)[number];

export const ENEM_AREA_LABELS: Record<EnemAreaKey, string> = {
  cn: 'Ciências da Natureza',
  ch: 'Ciências Humanas',
  lc: 'Linguagens e Códigos',
  mt: 'Matemática',
  essay: 'Redação',
};

export const ENEM_AREA_SHORT_LABELS: Record<EnemAreaKey, string> = {
  cn: 'Natureza',
  ch: 'Humanas',
  lc: 'Linguagens',
  mt: 'Matemática',
  essay: 'Redação',
};

type SchoolRow = {
  CO_ESCOLA: string;
  NO_ESCOLA: string;
  CO_MUNICIPIO: string;
  NO_MUNICIPIO: string;
  DEPENDENCIA: number;
  LOCALIZACAO: number;
  FONTE_IDENTIFICACAO: string;
  QTD_REGISTROS: number;
  QTD_PARTICIPANTES_CN: number;
  MEDIA_CN: number | null;
  QTD_PARTICIPANTES_CH: number;
  MEDIA_CH: number | null;
  QTD_PARTICIPANTES_LC: number;
  MEDIA_LC: number | null;
  QTD_PARTICIPANTES_MT: number;
  MEDIA_MT: number | null;
  QTD_PRESENTES_REDACAO: number;
  QTD_REDACOES_SEM_PROBLEMAS: number;
  PERCENTUAL_REDACOES_SEM_PROBLEMAS: number | null;
  MEDIA_REDACAO_GERAL: number | null;
  MEDIA_REDACAO_SEM_PROBLEMAS: number | null;
  IN_AGUA_POTAVEL: number;
  IN_ENERGIA_REDE_PUBLICA: number;
  IN_ESGOTO_REDE_PUBLICA: number;
  IN_LIXO_SERVICO_COLETA: number;
  IN_BIBLIOTECA: number;
  IN_BIBLIOTECA_SALA_LEITURA: number;
  IN_LABORATORIO_CIENCIAS: number;
  IN_LABORATORIO_INFORMATICA: number;
  IN_QUADRA_ESPORTES: number;
  IN_REFEITORIO: number;
  IN_INTERNET: number;
  IN_INTERNET_ALUNOS: number;
  IN_INTERNET_APRENDIZAGEM: number;
  IN_BANDA_LARGA: number | null;
  QT_DESKTOP_ALUNO: number;
  QT_COMP_PORTATIL_ALUNO: number;
  QT_TABLET_ALUNO: number;
  IN_BANHEIRO_PNE: number;
  IN_SALA_ATENDIMENTO_ESPECIAL: number;
  IN_ACESSIBILIDADE_RAMPAS: number;
  IN_ACESSIBILIDADE_PISOS_TATEIS: number;
  IN_ACESSIBILIDADE_SINALIZACAO: number;
  IN_ACESSIBILIDADE_INEXISTENTE: number;
  QT_SALAS_UTILIZADAS: number;
  QT_SALAS_UTILIZA_CLIMATIZADAS: number;
  QT_SALAS_UTILIZADAS_ACESSIVEIS: number;
  PERCENTUAL_SERVICOS_BASICOS: number;
  PERCENTUAL_ESPACOS_ESCOLARES: number;
  PERCENTUAL_RECURSOS_CONECTIVIDADE: number;
  TOTAL_DISPOSITIVOS_ALUNOS: number;
  PERCENTUAL_RECURSOS_ACESSIBILIDADE: number;
  PERCENTUAL_SALAS_CLIMATIZADAS: number;
  PERCENTUAL_SALAS_ACESSIVEIS: number;
};

type MunicipalityRow = {
  CO_MUNICIPIO: string;
  NO_MUNICIPIO: string;
  QTD_ESCOLAS: number;
  QTD_ESCOLAS_ENSINO_MEDIO: number;
  PCT_ESCOLAS_AGUA_POTAVEL: number;
  PCT_ESCOLAS_ENERGIA_REDE_PUBLICA: number;
  PCT_ESCOLAS_ESGOTO_REDE_PUBLICA: number;
  PCT_ESCOLAS_COLETA_LIXO: number;
  PCT_ESCOLAS_BIBLIOTECA_LEITURA: number;
  PCT_ESCOLAS_LAB_CIENCIAS: number;
  PCT_ESCOLAS_LAB_INFORMATICA: number;
  PCT_ESCOLAS_QUADRA: number;
  PCT_ESCOLAS_REFEITORIO: number;
  PCT_ESCOLAS_INTERNET: number;
  PCT_ESCOLAS_INTERNET_ALUNOS: number;
  PCT_ESCOLAS_INTERNET_APRENDIZAGEM: number;
  PCT_ESCOLAS_BANDA_LARGA: number;
  PCT_ESCOLAS_BANHEIRO_PNE: number;
  PCT_ESCOLAS_SALA_ATENDIMENTO_ESPECIAL: number;
  PCT_ESCOLAS_RAMPAS: number;
  PCT_ESCOLAS_PISOS_TATEIS: number;
  PCT_ESCOLAS_SINALIZACAO_ACESSIVEL: number;
  PCT_SALAS_CLIMATIZADAS: number;
  QTD_REGISTROS_ENEM: number;
  QTD_ESCOLAS_ENEM_TOTAL: number;
  QTD_ESCOLAS_ENEM_IDENTIFICADAS_CENSO: number;
  QTD_ESCOLAS_ENEM_NAO_VINCULADAS_CENSO: number;
  QTD_PARTICIPANTES_CN: number;
  MEDIA_CN: number;
  QTD_PARTICIPANTES_CH: number;
  MEDIA_CH: number;
  QTD_PARTICIPANTES_LC: number;
  MEDIA_LC: number;
  QTD_PARTICIPANTES_MT: number;
  MEDIA_MT: number;
  QTD_PRESENTES_REDACAO: number;
  MEDIA_REDACAO_GERAL: number;
  MEDIA_REDACAO_SEM_PROBLEMAS: number;
  PCT_ESCOLAS_ENSINO_MEDIO_IDENTIFICADAS_NO_ENEM: number;
  PCT_ESCOLAS_ENEM_NAO_VINCULADAS_CENSO: number;
};

export type SaebRow = {
  ANO_REFERENCIA: number;
  UF: string;
  DIMENSAO: string;
  CATEGORIA: string;
  ETAPA: string;
  QTD_ESCOLAS_GRUPO: number;
  TOTAL_MATRICULADOS_BASE_PARTICIPACAO: number;
  TOTAL_PRESENTES_BASE_PARTICIPACAO: number;
  TAXA_PARTICIPACAO_AGREGADA: number | null;
  MEDIA_LP_PONDERADA_PRESENTES: number | null;
  MEDIA_MT_PONDERADA_PRESENTES: number | null;
  QTD_ESTUDANTES_PESO_LP: number;
  QTD_ESTUDANTES_PESO_MT: number;
  MEDIA_ESCOLAR_FORMACAO_DOCENTE: number;
  MEDIANA_ESCOLAR_FORMACAO_DOCENTE: number;
};

type RuntimeData = {
  manifest: {
    project: string;
    version: string;
    documentationDate: string;
    acceptance: {
      publicSchools: number;
      municipalities: number;
      highSchools: number;
      enemSchools: number;
      linkedSchools: number;
      unlinkedSchools: number;
      enemRecords: number;
      saebRows: number;
    };
  };
  schools: SchoolRow[];
  municipalities: MunicipalityRow[];
  saeb: SaebRow[];
};

const DATA = generatedData as unknown as RuntimeData;

export type School = {
  code: string;
  municipalityCode: string;
  state: 'MA';
  municipality: string;
  name: string;
  dependency: 'Federal' | 'Estadual' | 'Municipal';
  location: 'Urbana' | 'Rural';
  year: 2025;
  dataType: 'REAL';
  source: string;
  records: number;
  participants: Record<EnemAreaKey, number>;
  averages: Record<EnemAreaKey, number | null> & { validEssay: number | null };
  validEssayCount: number;
  validEssayPercentage: number | null;
  infrastructure: Record<InfraKey, number>;
  resources: {
    water: boolean;
    publicEnergy: boolean;
    publicSewage: boolean;
    wasteCollection: boolean;
    library: boolean;
    readingRoom: boolean;
    scienceLab: boolean;
    computerLab: boolean;
    sportsCourt: boolean;
    cafeteria: boolean;
    internet: boolean;
    studentInternet: boolean;
    learningInternet: boolean;
    broadband: boolean | null;
    desktops: number;
    laptops: number;
    tablets: number;
    totalDevices: number;
    usedRooms: number;
    climateControlledRooms: number;
    accessibleRooms: number;
    accessibleRoomPercentage: number;
    noAccessibilityResource: boolean;
  };
};

export type Municipality = {
  code: string;
  name: string;
  schoolCount: number;
  highSchoolCount: number;
  enemRecords: number;
  enemSchoolCount: number;
  linkedEnemSchoolCount: number;
  unlinkedEnemSchoolCount: number;
  linkedCoveragePercentage: number;
  unlinkedPercentage: number;
  participants: Record<EnemAreaKey, number>;
  averages: Record<EnemAreaKey, number> & { validEssay: number };
  infrastructure: Record<InfraKey, number>;
};

export type TerritoryMetrics = {
  kind: 'state' | 'municipality';
  name: string;
  eyebrow: string;
  schoolCount: number;
  highSchoolCount: number;
  enemRecords: number;
  enemSchoolCount: number;
  linkedEnemSchoolCount: number;
  linkedCoveragePercentage: number;
  participants: Record<EnemAreaKey, number>;
  averages: Record<EnemAreaKey, number>;
  infrastructure: Record<InfraKey, number>;
};

function average(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function weightedAverage(
  values: Array<{ value: number; weight: number }>,
): number {
  const totalWeight = values.reduce((total, item) => total + item.weight, 0);
  if (!totalWeight) return 0;
  return (
    values.reduce((total, item) => total + item.value * item.weight, 0) /
    totalWeight
  );
}

function dependencyLabel(code: number): School['dependency'] {
  return code === 1 ? 'Federal' : code === 3 ? 'Municipal' : 'Estadual';
}

function municipalityInfrastructure(
  row: MunicipalityRow,
): Record<InfraKey, number> {
  return {
    basicServices:
      average([
        row.PCT_ESCOLAS_AGUA_POTAVEL,
        row.PCT_ESCOLAS_ENERGIA_REDE_PUBLICA,
        row.PCT_ESCOLAS_ESGOTO_REDE_PUBLICA,
        row.PCT_ESCOLAS_COLETA_LIXO,
      ]) / 10,
    learningSpaces:
      average([
        row.PCT_ESCOLAS_BIBLIOTECA_LEITURA,
        row.PCT_ESCOLAS_LAB_CIENCIAS,
        row.PCT_ESCOLAS_LAB_INFORMATICA,
        row.PCT_ESCOLAS_QUADRA,
        row.PCT_ESCOLAS_REFEITORIO,
      ]) / 10,
    connectivity:
      average([
        row.PCT_ESCOLAS_INTERNET,
        row.PCT_ESCOLAS_INTERNET_ALUNOS,
        row.PCT_ESCOLAS_INTERNET_APRENDIZAGEM,
        row.PCT_ESCOLAS_BANDA_LARGA,
      ]) / 10,
    accessibility:
      average([
        row.PCT_ESCOLAS_BANHEIRO_PNE,
        row.PCT_ESCOLAS_SALA_ATENDIMENTO_ESPECIAL,
        row.PCT_ESCOLAS_RAMPAS,
        row.PCT_ESCOLAS_PISOS_TATEIS,
        row.PCT_ESCOLAS_SINALIZACAO_ACESSIVEL,
      ]) / 10,
    climate: row.PCT_SALAS_CLIMATIZADAS / 10,
  };
}

export const MUNICIPALITIES: Municipality[] = DATA.municipalities.map(
  (row) => ({
    code: row.CO_MUNICIPIO,
    name: row.NO_MUNICIPIO,
    schoolCount: row.QTD_ESCOLAS,
    highSchoolCount: row.QTD_ESCOLAS_ENSINO_MEDIO,
    enemRecords: row.QTD_REGISTROS_ENEM,
    enemSchoolCount: row.QTD_ESCOLAS_ENEM_TOTAL,
    linkedEnemSchoolCount: row.QTD_ESCOLAS_ENEM_IDENTIFICADAS_CENSO,
    unlinkedEnemSchoolCount: row.QTD_ESCOLAS_ENEM_NAO_VINCULADAS_CENSO,
    linkedCoveragePercentage:
      row.PCT_ESCOLAS_ENSINO_MEDIO_IDENTIFICADAS_NO_ENEM,
    unlinkedPercentage: row.PCT_ESCOLAS_ENEM_NAO_VINCULADAS_CENSO,
    participants: {
      cn: row.QTD_PARTICIPANTES_CN,
      ch: row.QTD_PARTICIPANTES_CH,
      lc: row.QTD_PARTICIPANTES_LC,
      mt: row.QTD_PARTICIPANTES_MT,
      essay: row.QTD_PRESENTES_REDACAO,
    },
    averages: {
      cn: row.MEDIA_CN,
      ch: row.MEDIA_CH,
      lc: row.MEDIA_LC,
      mt: row.MEDIA_MT,
      essay: row.MEDIA_REDACAO_GERAL,
      validEssay: row.MEDIA_REDACAO_SEM_PROBLEMAS,
    },
    infrastructure: municipalityInfrastructure(row),
  }),
);

const municipalityByCode = new Map(
  MUNICIPALITIES.map((municipality) => [municipality.code, municipality]),
);

export const SCHOOLS: School[] = DATA.schools
  .map<School>((row) => ({
    code: row.CO_ESCOLA,
    municipalityCode: row.CO_MUNICIPIO,
    state: 'MA',
    municipality: row.NO_MUNICIPIO,
    name: row.NO_ESCOLA,
    dependency: dependencyLabel(row.DEPENDENCIA),
    location: row.LOCALIZACAO === 2 ? 'Rural' : 'Urbana',
    year: 2025,
    dataType: 'REAL',
    source: row.FONTE_IDENTIFICACAO,
    records: row.QTD_REGISTROS,
    participants: {
      cn: row.QTD_PARTICIPANTES_CN,
      ch: row.QTD_PARTICIPANTES_CH,
      lc: row.QTD_PARTICIPANTES_LC,
      mt: row.QTD_PARTICIPANTES_MT,
      essay: row.QTD_PRESENTES_REDACAO,
    },
    averages: {
      cn: row.MEDIA_CN,
      ch: row.MEDIA_CH,
      lc: row.MEDIA_LC,
      mt: row.MEDIA_MT,
      essay: row.MEDIA_REDACAO_GERAL,
      validEssay: row.MEDIA_REDACAO_SEM_PROBLEMAS,
    },
    validEssayCount: row.QTD_REDACOES_SEM_PROBLEMAS,
    validEssayPercentage: row.PERCENTUAL_REDACOES_SEM_PROBLEMAS,
    infrastructure: {
      basicServices: row.PERCENTUAL_SERVICOS_BASICOS / 10,
      learningSpaces: row.PERCENTUAL_ESPACOS_ESCOLARES / 10,
      connectivity: row.PERCENTUAL_RECURSOS_CONECTIVIDADE / 10,
      accessibility: row.PERCENTUAL_RECURSOS_ACESSIBILIDADE / 10,
      climate: row.PERCENTUAL_SALAS_CLIMATIZADAS / 10,
    },
    resources: {
      water: row.IN_AGUA_POTAVEL === 1,
      publicEnergy: row.IN_ENERGIA_REDE_PUBLICA === 1,
      publicSewage: row.IN_ESGOTO_REDE_PUBLICA === 1,
      wasteCollection: row.IN_LIXO_SERVICO_COLETA === 1,
      library: row.IN_BIBLIOTECA === 1,
      readingRoom: row.IN_BIBLIOTECA_SALA_LEITURA === 1,
      scienceLab: row.IN_LABORATORIO_CIENCIAS === 1,
      computerLab: row.IN_LABORATORIO_INFORMATICA === 1,
      sportsCourt: row.IN_QUADRA_ESPORTES === 1,
      cafeteria: row.IN_REFEITORIO === 1,
      internet: row.IN_INTERNET === 1,
      studentInternet: row.IN_INTERNET_ALUNOS === 1,
      learningInternet: row.IN_INTERNET_APRENDIZAGEM === 1,
      broadband: row.IN_BANDA_LARGA === null ? null : row.IN_BANDA_LARGA === 1,
      desktops: row.QT_DESKTOP_ALUNO,
      laptops: row.QT_COMP_PORTATIL_ALUNO,
      tablets: row.QT_TABLET_ALUNO,
      totalDevices: row.TOTAL_DISPOSITIVOS_ALUNOS,
      usedRooms: row.QT_SALAS_UTILIZADAS,
      climateControlledRooms: row.QT_SALAS_UTILIZA_CLIMATIZADAS,
      accessibleRooms: row.QT_SALAS_UTILIZADAS_ACESSIVEIS,
      accessibleRoomPercentage: row.PERCENTUAL_SALAS_ACESSIVEIS,
      noAccessibilityResource: row.IN_ACESSIBILIDADE_INEXISTENTE === 1,
    },
  }))
  .sort(
    (left, right) =>
      left.municipality.localeCompare(right.municipality, 'pt-BR') ||
      left.name.localeCompare(right.name, 'pt-BR'),
  );

export function buildMunicipalityMetrics(
  municipalityName: string,
): TerritoryMetrics {
  const municipality =
    MUNICIPALITIES.find((item) => item.name === municipalityName) ??
    MUNICIPALITIES[0];

  return {
    kind: 'municipality',
    name: municipality.name,
    eyebrow: 'Município do Maranhão',
    schoolCount: municipality.schoolCount,
    highSchoolCount: municipality.highSchoolCount,
    enemRecords: municipality.enemRecords,
    enemSchoolCount: municipality.enemSchoolCount,
    linkedEnemSchoolCount: municipality.linkedEnemSchoolCount,
    linkedCoveragePercentage: municipality.linkedCoveragePercentage,
    participants: municipality.participants,
    averages: {
      cn: municipality.averages.cn,
      ch: municipality.averages.ch,
      lc: municipality.averages.lc,
      mt: municipality.averages.mt,
      essay: municipality.averages.essay,
    },
    infrastructure: municipality.infrastructure,
  };
}

export const STATE_METRICS: TerritoryMetrics = {
  kind: 'state',
  name: 'Maranhão',
  eyebrow: 'Visão estadual',
  schoolCount: MUNICIPALITIES.reduce(
    (total, municipality) => total + municipality.schoolCount,
    0,
  ),
  highSchoolCount: MUNICIPALITIES.reduce(
    (total, municipality) => total + municipality.highSchoolCount,
    0,
  ),
  enemRecords: MUNICIPALITIES.reduce(
    (total, municipality) => total + municipality.enemRecords,
    0,
  ),
  enemSchoolCount: MUNICIPALITIES.reduce(
    (total, municipality) => total + municipality.enemSchoolCount,
    0,
  ),
  linkedEnemSchoolCount: MUNICIPALITIES.reduce(
    (total, municipality) => total + municipality.linkedEnemSchoolCount,
    0,
  ),
  linkedCoveragePercentage: (() => {
    const highSchoolCount = MUNICIPALITIES.reduce(
      (total, municipality) => total + municipality.highSchoolCount,
      0,
    );
    const linkedSchoolCount = MUNICIPALITIES.reduce(
      (total, municipality) => total + municipality.linkedEnemSchoolCount,
      0,
    );
    return highSchoolCount ? (linkedSchoolCount / highSchoolCount) * 100 : 0;
  })(),
  participants: Object.fromEntries(
    ENEM_AREA_KEYS.map((key) => [
      key,
      MUNICIPALITIES.reduce(
        (total, municipality) => total + municipality.participants[key],
        0,
      ),
    ]),
  ) as Record<EnemAreaKey, number>,
  averages: Object.fromEntries(
    ENEM_AREA_KEYS.map((key) => [
      key,
      weightedAverage(
        MUNICIPALITIES.map((municipality) => ({
          value: municipality.averages[key],
          weight: municipality.participants[key],
        })),
      ),
    ]),
  ) as Record<EnemAreaKey, number>,
  infrastructure: Object.fromEntries(
    INFRA_KEYS.map((key) => [
      key,
      weightedAverage(
        MUNICIPALITIES.map((municipality) => ({
          value: municipality.infrastructure[key],
          weight: municipality.schoolCount,
        })),
      ),
    ]),
  ) as Record<InfraKey, number>,
};

export const DATA_MANIFEST = DATA.manifest;
export const SAEB_CONTEXT = DATA.saeb;
export const SAEB_STATE = DATA.saeb.filter((row) => row.DIMENSAO === 'Estado');
export const DEFAULT_SCHOOL_CODE =
  SCHOOLS.find((school) => school.code === '21288780')?.code ?? SCHOOLS[0].code;

export type SchoolContext = ReturnType<typeof buildSchoolContext>;

export function buildSchoolContext(
  schoolCode: string,
  compareMunicipal: boolean,
) {
  const school = SCHOOLS.find((item) => item.code === schoolCode) ?? SCHOOLS[0];
  const municipality =
    municipalityByCode.get(school.municipalityCode) ?? MUNICIPALITIES[0];
  const municipalitySchools = SCHOOLS.filter(
    (item) => item.municipalityCode === school.municipalityCode,
  );
  const infrastructureScore = average(
    INFRA_KEYS.map((key) => school.infrastructure[key]),
  );
  const municipalScore = average(
    INFRA_KEYS.map((key) => municipality.infrastructure[key]),
  );
  const criticalFactor = INFRA_KEYS.reduce((lowest, key) =>
    school.infrastructure[key] < school.infrastructure[lowest] ? key : lowest,
  );
  const performanceAreas = ENEM_AREA_KEYS.map((key) => ({
    key,
    label: ENEM_AREA_LABELS[key],
    schoolAverage: school.averages[key],
    municipalAverage: municipality.averages[key],
    schoolParticipants: school.participants[key],
    municipalParticipants: municipality.participants[key],
  }));
  const validPerformanceAreas = performanceAreas.filter(
    (area) => area.schoolAverage !== null,
  );
  const lowestPerformanceArea = validPerformanceAreas.reduce<
    (typeof validPerformanceAreas)[number] | null
  >(
    (lowest, area) =>
      !lowest ||
      (area.schoolAverage ?? Infinity) < (lowest.schoolAverage ?? Infinity)
        ? area
        : lowest,
    null,
  );
  const lowSampleAreas = performanceAreas.filter(
    (area) => area.schoolParticipants < 30,
  );

  return {
    school,
    municipality,
    municipalitySchools,
    municipalInfrastructure: municipality.infrastructure,
    infrastructureScore,
    municipalScore,
    connectivityScore: school.infrastructure.connectivity,
    connectivityStatus:
      school.infrastructure.connectivity >= 7.5
        ? ('Favorável' as const)
        : school.infrastructure.connectivity >= 5
          ? ('Parcial' as const)
          : ('Crítica' as const),
    criticalFactor,
    criticalFactorName: INFRA_LABELS[criticalFactor],
    performanceAreas,
    lowestPerformanceArea,
    lowSampleAreas,
    compareMunicipal,
  };
}

export const DOCUMENT_SOURCES = {
  school: 'ENEM 2025 + Censo Escolar 2025 · base escolar identificada',
  municipality: 'Censo Escolar 2025 + ENEM 2025 · agregação municipal',
  saeb: 'SAEB 2023 · contexto estadual do Maranhão',
  dictionary: 'Dicionário de Dados ATLAS Escolar · versão 1.0',
};
