import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const incomingRoot = join(projectRoot, 'data', 'incoming');
const basesRoot = process.env.ATLAS_BASES_ROOT || join(incomingRoot, 'bases');
const documentationRoot = join(incomingRoot, 'documentacao');
const generatedRoot =
  process.env.ATLAS_GENERATED_ROOT || join(projectRoot, 'lib', 'generated');
const publicDataRoot =
  process.env.ATLAS_PUBLIC_DATA_ROOT || join(projectRoot, 'public', 'data');

const dictionaryPath = join(
  documentationRoot,
  'dicionario_dados_atlas_escolar.json',
);
const dictionary = JSON.parse(await readFile(dictionaryPath, 'utf8'));

const DATASET_FAMILIES = {
  schools: /^enem_censo_indicadores_infraestrutura_(\d{4})\.csv$/,
  census: /^censo_municipios_ma_(\d{4})\.csv$/,
  municipalities: /^censo_enem_municipios_ma_(\d{4})\.csv$/,
  saeb: /^saeb_contexto_estadual_ma_(\d{4})\.csv$/,
};

function identifyDataset(fileName) {
  for (const [kind, pattern] of Object.entries(DATASET_FAMILIES)) {
    const match = fileName.match(pattern);
    if (match) return { kind, year: Number(match[1]) };
  }
  return null;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ';') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }

  return rows;
}

function convertValue(value, field) {
  if (value === '') return null;
  if (field.tipo_recomendado === 'texto') return value;
  if (
    field.tipo_recomendado.includes('inteiro') ||
    field.tipo_recomendado.includes('decimal') ||
    field.tipo_recomendado.includes('booleano')
  ) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new Error(`Valor numérico inválido em ${field.campo}: ${value}`);
    }
    return number;
  }
  return value;
}

function uniqueKey(row, keyDefinition) {
  return keyDefinition
    .split('+')
    .map((key) => String(row[key.trim()]))
    .join('|');
}

function templateFor(kind) {
  const entry = Object.entries(dictionary.datasets).find(([fileName]) => {
    const identified = identifyDataset(fileName);
    return identified?.kind === kind;
  });
  if (!entry)
    throw new Error(`Dicionário sem esquema de referência para ${kind}.`);
  return entry[1];
}

async function loadDataset(fileName, documentedMetadata, templateMetadata) {
  const path = join(basesRoot, fileName);
  const bytes = await readFile(path);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (documentedMetadata?.sha256 && hash !== documentedMetadata.sha256) {
    throw new Error(
      `${fileName}: SHA-256 divergente. Esperado ${documentedMetadata.sha256}; recebido ${hash}.`,
    );
  }
  if (!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
    throw new Error(`${fileName}: o arquivo não possui BOM UTF-8.`);
  }

  const parsed = parseCsv(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  const [headers, ...rawRows] = parsed;
  const schema = documentedMetadata ?? templateMetadata;
  const documentedHeaders = schema.campos.map((field) => field.campo);
  if (
    headers.length !== schema.colunas ||
    headers.some((header, index) => header !== documentedHeaders[index])
  ) {
    throw new Error(`${fileName}: cabeçalho diferente do esquema da família.`);
  }
  if (documentedMetadata && rawRows.length !== documentedMetadata.linhas) {
    throw new Error(
      `${fileName}: esperado ${documentedMetadata.linhas} linhas; recebido ${rawRows.length}.`,
    );
  }

  const rows = rawRows.map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(
        `${fileName}: linha ${rowIndex + 2} possui ${values.length} colunas; esperado ${headers.length}.`,
      );
    }
    return Object.fromEntries(
      headers.map((header, index) => [
        header,
        convertValue(values[index], schema.campos[index]),
      ]),
    );
  });

  const keys = new Set();
  for (const row of rows) {
    const key = uniqueKey(row, schema.chave);
    if (key.includes('null')) {
      throw new Error(`${fileName}: chave obrigatória nula (${key}).`);
    }
    if (keys.has(key)) throw new Error(`${fileName}: chave duplicada ${key}.`);
    keys.add(key);
  }

  // Metadados documentados são uma fotografia imutável da entrega homologada.
  // Anos novos usam o mesmo esquema, mas podem ter contagens e nulos diferentes.
  if (documentedMetadata) {
    for (const field of documentedMetadata.campos) {
      const nulls = rows.reduce(
        (total, row) => total + (row[field.campo] === null ? 1 : 0),
        0,
      );
      if (nulls !== field.nulos_na_entrega) {
        throw new Error(
          `${fileName}.${field.campo}: esperado ${field.nulos_na_entrega} nulos; recebido ${nulls}.`,
        );
      }
    }
  }

  return { rows, hash, schema };
}

const baseFiles = (await readdir(basesRoot))
  .filter((fileName) => identifyDataset(fileName))
  .sort();
if (!baseFiles.length) {
  throw new Error(`Nenhuma base reconhecida encontrada em ${basesRoot}.`);
}

const loadedEntries = await Promise.all(
  baseFiles.map(async (fileName) => {
    const identity = identifyDataset(fileName);
    const documentedMetadata = dictionary.datasets[fileName];
    const loaded = await loadDataset(
      fileName,
      documentedMetadata,
      templateFor(identity.kind),
    );
    return [fileName, { ...identity, ...loaded, documentedMetadata }];
  }),
);
const datasets = Object.fromEntries(loadedEntries);

function assertClose(
  fileName,
  rowKey,
  field,
  actual,
  expected,
  tolerance = 0.011,
) {
  if (actual === null && expected === null) return;
  if (
    typeof actual !== 'number' ||
    typeof expected !== 'number' ||
    Math.abs(actual - expected) > tolerance
  ) {
    throw new Error(
      `${fileName}.${rowKey}.${field}: esperado ${expected}; recebido ${actual}.`,
    );
  }
}

const atlasFilesByYear = new Map();
const saebFilesByYear = new Map();
for (const [fileName, dataset] of Object.entries(datasets)) {
  if (dataset.kind === 'saeb') {
    if (saebFilesByYear.has(dataset.year)) {
      throw new Error(`Mais de uma base SAEB encontrada para ${dataset.year}.`);
    }
    saebFilesByYear.set(dataset.year, fileName);
    continue;
  }
  const group = atlasFilesByYear.get(dataset.year) ?? {};
  if (group[dataset.kind]) {
    throw new Error(
      `Mais de uma base ${dataset.kind} encontrada para ${dataset.year}.`,
    );
  }
  group[dataset.kind] = fileName;
  atlasFilesByYear.set(dataset.year, group);
}

for (const [year, group] of atlasFilesByYear) {
  const missing = ['schools', 'census', 'municipalities'].filter(
    (kind) => !group[kind],
  );
  if (missing.length) {
    throw new Error(
      `Ano ${year} incompleto: faltam as bases ${missing.join(', ')}.`,
    );
  }

  const schoolDataset = datasets[group.schools];
  for (const row of schoolDataset.rows) {
    const key = row.CO_ESCOLA;
    assertClose(
      group.schools,
      key,
      'PERCENTUAL_SERVICOS_BASICOS',
      row.PERCENTUAL_SERVICOS_BASICOS,
      (100 * row.QTD_SERVICOS_BASICOS) / 4,
    );
    assertClose(
      group.schools,
      key,
      'PERCENTUAL_ESPACOS_ESCOLARES',
      row.PERCENTUAL_ESPACOS_ESCOLARES,
      (100 * row.QTD_ESPACOS_ESCOLARES) / 5,
    );
    assertClose(
      group.schools,
      key,
      'PERCENTUAL_RECURSOS_CONECTIVIDADE',
      row.PERCENTUAL_RECURSOS_CONECTIVIDADE,
      row.QTD_INFORMACOES_CONECTIVIDADE
        ? (100 * row.QTD_RECURSOS_CONECTIVIDADE) /
            row.QTD_INFORMACOES_CONECTIVIDADE
        : null,
    );
    assertClose(
      group.schools,
      key,
      'TOTAL_DISPOSITIVOS_ALUNOS',
      row.TOTAL_DISPOSITIVOS_ALUNOS,
      row.QT_DESKTOP_ALUNO + row.QT_COMP_PORTATIL_ALUNO + row.QT_TABLET_ALUNO,
      0,
    );
    assertClose(
      group.schools,
      key,
      'PERCENTUAL_RECURSOS_ACESSIBILIDADE',
      row.PERCENTUAL_RECURSOS_ACESSIBILIDADE,
      (100 * row.QTD_RECURSOS_ACESSIBILIDADE) / 5,
    );
    assertClose(
      group.schools,
      key,
      'PERCENTUAL_SALAS_CLIMATIZADAS',
      row.PERCENTUAL_SALAS_CLIMATIZADAS,
      row.QT_SALAS_UTILIZADAS
        ? (100 * row.QT_SALAS_UTILIZA_CLIMATIZADAS) / row.QT_SALAS_UTILIZADAS
        : null,
    );
    assertClose(
      group.schools,
      key,
      'PERCENTUAL_SALAS_ACESSIVEIS',
      row.PERCENTUAL_SALAS_ACESSIVEIS,
      row.QT_SALAS_UTILIZADAS
        ? (100 * row.QT_SALAS_UTILIZADAS_ACESSIVEIS) / row.QT_SALAS_UTILIZADAS
        : null,
    );
    assertClose(
      group.schools,
      key,
      'PERCENTUAL_REDACOES_SEM_PROBLEMAS',
      row.PERCENTUAL_REDACOES_SEM_PROBLEMAS,
      row.QTD_PRESENTES_REDACAO
        ? (100 * row.QTD_REDACOES_SEM_PROBLEMAS) / row.QTD_PRESENTES_REDACAO
        : null,
    );
  }

  const censusRows = datasets[group.census].rows;
  const municipalityRows = datasets[group.municipalities].rows;
  const censusByMunicipality = new Map(
    censusRows.map((row) => [row.CO_MUNICIPIO, row]),
  );
  for (const integratedRow of municipalityRows) {
    const censusRow = censusByMunicipality.get(integratedRow.CO_MUNICIPIO);
    if (!censusRow) {
      throw new Error(
        `${year}: município ${integratedRow.CO_MUNICIPIO} ausente na base do Censo.`,
      );
    }
    for (const field of datasets[group.census].schema.campos) {
      if (censusRow[field.campo] !== integratedRow[field.campo]) {
        throw new Error(
          `${year}: divergência do Censo em ${integratedRow.CO_MUNICIPIO}.${field.campo}.`,
        );
      }
    }
  }
}

for (const [year, fileName] of saebFilesByYear) {
  const invalidYear = datasets[fileName].rows.find(
    (row) => row.ANO_REFERENCIA !== year,
  );
  if (invalidYear) {
    throw new Error(
      `${fileName}: ANO_REFERENCIA deve ser ${year}, conforme o nome do arquivo.`,
    );
  }
}

const atlasYears = [...atlasFilesByYear.keys()].sort((a, b) => b - a);
const saebYears = [...saebFilesByYear.keys()].sort((a, b) => b - a);
if (!atlasYears.length)
  throw new Error('Nenhum ano integrado de Censo/ENEM encontrado.');

const acceptanceByYear = {};
const runtimeYears = {};
for (const year of atlasYears) {
  const group = atlasFilesByYear.get(year);
  const schools = datasets[group.schools].rows;
  const municipalities = datasets[group.municipalities].rows;
  acceptanceByYear[year] = {
    publicSchools: municipalities.reduce(
      (total, row) => total + row.QTD_ESCOLAS,
      0,
    ),
    municipalities: municipalities.length,
    highSchools: municipalities.reduce(
      (total, row) => total + row.QTD_ESCOLAS_ENSINO_MEDIO,
      0,
    ),
    enemSchools: municipalities.reduce(
      (total, row) => total + row.QTD_ESCOLAS_ENEM_TOTAL,
      0,
    ),
    linkedSchools: schools.length,
    unlinkedSchools: municipalities.reduce(
      (total, row) => total + row.QTD_ESCOLAS_ENEM_NAO_VINCULADAS_CENSO,
      0,
    ),
    enemRecords: municipalities.reduce(
      (total, row) => total + row.QTD_REGISTROS_ENEM,
      0,
    ),
  };
  runtimeYears[year] = { schools, municipalities };
}

const saebByYear = Object.fromEntries(
  saebYears.map((year) => [year, datasets[saebFilesByYear.get(year)].rows]),
);
const defaultYear = atlasYears[0];
const defaultSaebYear = saebYears[0] ?? null;
const manifest = {
  project: dictionary.projeto,
  version: dictionary.versao_documentacao,
  documentationDate: dictionary.data_documentacao,
  generatedFrom: 'data/incoming/bases',
  availableYears: { atlas: atlasYears, saeb: saebYears },
  defaultYear,
  defaultSaebYear,
  datasets: Object.fromEntries(
    Object.entries(datasets).map(([fileName, dataset]) => [
      fileName,
      {
        sha256: dataset.hash,
        rows: dataset.rows.length,
        columns: dataset.schema.colunas,
        source: dataset.documentedMetadata?.fonte ?? dataset.schema.fonte,
        purpose:
          dataset.documentedMetadata?.finalidade ?? dataset.schema.finalidade,
        kind: dataset.kind,
        year: dataset.year,
        documented: Boolean(dataset.documentedMetadata),
      },
    ]),
  ),
  acceptance: {
    ...acceptanceByYear[defaultYear],
    saebRows: defaultSaebYear === null ? 0 : saebByYear[defaultSaebYear].length,
  },
  acceptanceByYear,
};

const runtimeData = {
  manifest,
  years: runtimeYears,
  saebByYear,
};

await mkdir(generatedRoot, { recursive: true });
await mkdir(publicDataRoot, { recursive: true });
await writeFile(
  join(generatedRoot, 'atlas-real-data.json'),
  `${JSON.stringify(runtimeData)}\n`,
  'utf8',
);
await writeFile(
  join(generatedRoot, 'atlas-dictionary.json'),
  `${JSON.stringify(dictionary)}\n`,
  'utf8',
);
await writeFile(
  join(publicDataRoot, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

console.log(
  `Dados ATLAS validados: anos Censo/ENEM ${atlasYears.join(', ')}; anos SAEB ${saebYears.join(', ') || 'nenhum'}.`,
);
