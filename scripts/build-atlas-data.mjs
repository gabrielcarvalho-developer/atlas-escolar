import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const incomingRoot = join(projectRoot, 'data', 'incoming');
const basesRoot = join(incomingRoot, 'bases');
const documentationRoot = join(incomingRoot, 'documentacao');
const generatedRoot = join(projectRoot, 'lib', 'generated');
const publicDataRoot = join(projectRoot, 'public', 'data');

const dictionaryPath = join(documentationRoot, 'dicionario_dados_atlas_escolar.json');
const dictionary = JSON.parse(await readFile(dictionaryPath, 'utf8'));

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
  if (field.tipo_recomendado.includes('inteiro') || field.tipo_recomendado.includes('decimal') || field.tipo_recomendado.includes('booleano')) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`Valor numérico inválido em ${field.campo}: ${value}`);
    return number;
  }
  return value;
}

function uniqueKey(row, keyDefinition) {
  return keyDefinition.split('+').map((key) => String(row[key.trim()])).join('|');
}

async function loadDataset(fileName, metadata) {
  const path = join(basesRoot, fileName);
  const bytes = await readFile(path);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== metadata.sha256) {
    throw new Error(`${fileName}: SHA-256 divergente. Esperado ${metadata.sha256}; recebido ${hash}.`);
  }
  if (!(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) {
    throw new Error(`${fileName}: o arquivo não possui BOM UTF-8.`);
  }

  const parsed = parseCsv(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  const [headers, ...rawRows] = parsed;
  const documentedHeaders = metadata.campos.map((field) => field.campo);
  if (headers.length !== metadata.colunas || headers.some((header, index) => header !== documentedHeaders[index])) {
    throw new Error(`${fileName}: cabeçalho diferente do dicionário de dados.`);
  }
  if (rawRows.length !== metadata.linhas) {
    throw new Error(`${fileName}: esperado ${metadata.linhas} linhas; recebido ${rawRows.length}.`);
  }

  const rows = rawRows.map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(`${fileName}: linha ${rowIndex + 2} possui ${values.length} colunas; esperado ${headers.length}.`);
    }
    return Object.fromEntries(headers.map((header, index) => [header, convertValue(values[index], metadata.campos[index])]));
  });

  const keys = new Set();
  for (const row of rows) {
    const key = uniqueKey(row, metadata.chave);
    if (keys.has(key)) throw new Error(`${fileName}: chave duplicada ${key}.`);
    keys.add(key);
  }

  for (const field of metadata.campos) {
    const nulls = rows.reduce((total, row) => total + (row[field.campo] === null ? 1 : 0), 0);
    if (nulls !== field.nulos_na_entrega) {
      throw new Error(`${fileName}.${field.campo}: esperado ${field.nulos_na_entrega} nulos; recebido ${nulls}.`);
    }
  }

  return rows;
}

const datasetEntries = await Promise.all(
  Object.entries(dictionary.datasets).map(async ([fileName, metadata]) => [fileName, await loadDataset(fileName, metadata)]),
);
const datasets = Object.fromEntries(datasetEntries);

const schoolFile = 'enem_censo_indicadores_infraestrutura_2025.csv';
const censusFile = 'censo_municipios_ma_2025.csv';
const municipalityFile = 'censo_enem_municipios_ma_2025.csv';
const saebFile = 'saeb_contexto_estadual_ma_2023.csv';

function assertClose(fileName, rowKey, field, actual, expected, tolerance = 0.011) {
  if (actual === null && expected === null) return;
  if (typeof actual !== 'number' || typeof expected !== 'number' || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${fileName}.${rowKey}.${field}: esperado ${expected}; recebido ${actual}.`);
  }
}

for (const row of datasets[schoolFile]) {
  const key = row.CO_ESCOLA;
  assertClose(schoolFile, key, 'PERCENTUAL_SERVICOS_BASICOS', row.PERCENTUAL_SERVICOS_BASICOS, 100 * row.QTD_SERVICOS_BASICOS / 4);
  assertClose(schoolFile, key, 'PERCENTUAL_ESPACOS_ESCOLARES', row.PERCENTUAL_ESPACOS_ESCOLARES, 100 * row.QTD_ESPACOS_ESCOLARES / 5);
  assertClose(schoolFile, key, 'PERCENTUAL_RECURSOS_CONECTIVIDADE', row.PERCENTUAL_RECURSOS_CONECTIVIDADE, row.QTD_INFORMACOES_CONECTIVIDADE ? 100 * row.QTD_RECURSOS_CONECTIVIDADE / row.QTD_INFORMACOES_CONECTIVIDADE : null);
  assertClose(schoolFile, key, 'TOTAL_DISPOSITIVOS_ALUNOS', row.TOTAL_DISPOSITIVOS_ALUNOS, row.QT_DESKTOP_ALUNO + row.QT_COMP_PORTATIL_ALUNO + row.QT_TABLET_ALUNO, 0);
  assertClose(schoolFile, key, 'PERCENTUAL_RECURSOS_ACESSIBILIDADE', row.PERCENTUAL_RECURSOS_ACESSIBILIDADE, 100 * row.QTD_RECURSOS_ACESSIBILIDADE / 5);
  assertClose(schoolFile, key, 'PERCENTUAL_SALAS_CLIMATIZADAS', row.PERCENTUAL_SALAS_CLIMATIZADAS, row.QT_SALAS_UTILIZADAS ? 100 * row.QT_SALAS_UTILIZA_CLIMATIZADAS / row.QT_SALAS_UTILIZADAS : null);
  assertClose(schoolFile, key, 'PERCENTUAL_SALAS_ACESSIVEIS', row.PERCENTUAL_SALAS_ACESSIVEIS, row.QT_SALAS_UTILIZADAS ? 100 * row.QT_SALAS_UTILIZADAS_ACESSIVEIS / row.QT_SALAS_UTILIZADAS : null);
  assertClose(schoolFile, key, 'PERCENTUAL_REDACOES_SEM_PROBLEMAS', row.PERCENTUAL_REDACOES_SEM_PROBLEMAS, row.QTD_PRESENTES_REDACAO ? 100 * row.QTD_REDACOES_SEM_PROBLEMAS / row.QTD_PRESENTES_REDACAO : null);
}

const censusByMunicipality = new Map(datasets[censusFile].map((row) => [row.CO_MUNICIPIO, row]));
for (const integratedRow of datasets[municipalityFile]) {
  const censusRow = censusByMunicipality.get(integratedRow.CO_MUNICIPIO);
  if (!censusRow) throw new Error(`Município ${integratedRow.CO_MUNICIPIO} ausente na base do Censo.`);
  for (const field of dictionary.datasets[censusFile].campos) {
    if (censusRow[field.campo] !== integratedRow[field.campo]) {
      throw new Error(`Divergência do Censo em ${integratedRow.CO_MUNICIPIO}.${field.campo}.`);
    }
  }
}

const manifest = {
  project: dictionary.projeto,
  version: dictionary.versao_documentacao,
  documentationDate: dictionary.data_documentacao,
  generatedFrom: 'data/incoming',
  datasets: Object.fromEntries(
    Object.entries(dictionary.datasets).map(([fileName, metadata]) => [fileName, {
      sha256: metadata.sha256,
      rows: metadata.linhas,
      columns: metadata.colunas,
      source: metadata.fonte,
      purpose: metadata.finalidade,
    }]),
  ),
  acceptance: {
    publicSchools: datasets[censusFile].reduce((total, row) => total + row.QTD_ESCOLAS, 0),
    municipalities: datasets[censusFile].length,
    highSchools: datasets[censusFile].reduce((total, row) => total + row.QTD_ESCOLAS_ENSINO_MEDIO, 0),
    enemSchools: datasets[municipalityFile].reduce((total, row) => total + row.QTD_ESCOLAS_ENEM_TOTAL, 0),
    linkedSchools: datasets[schoolFile].length,
    unlinkedSchools: datasets[municipalityFile].reduce((total, row) => total + row.QTD_ESCOLAS_ENEM_NAO_VINCULADAS_CENSO, 0),
    enemRecords: datasets[municipalityFile].reduce((total, row) => total + row.QTD_REGISTROS_ENEM, 0),
    saebRows: datasets[saebFile].length,
  },
};

const expectedAcceptance = {
  publicSchools: 10080,
  municipalities: 217,
  highSchools: 925,
  enemSchools: 821,
  linkedSchools: 711,
  unlinkedSchools: 110,
  enemRecords: 60992,
  saebRows: 30,
};
for (const [indicator, expected] of Object.entries(expectedAcceptance)) {
  if (manifest.acceptance[indicator] !== expected) {
    throw new Error(`Critério de aceite ${indicator}: esperado ${expected}; recebido ${manifest.acceptance[indicator]}.`);
  }
}

const runtimeData = {
  manifest,
  schools: datasets[schoolFile],
  municipalities: datasets[municipalityFile],
  saeb: datasets[saebFile],
};

await mkdir(generatedRoot, { recursive: true });
await mkdir(publicDataRoot, { recursive: true });
await writeFile(join(generatedRoot, 'atlas-real-data.json'), `${JSON.stringify(runtimeData)}\n`, 'utf8');
await writeFile(join(generatedRoot, 'atlas-dictionary.json'), `${JSON.stringify(dictionary)}\n`, 'utf8');
await writeFile(join(publicDataRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`Dados ATLAS validados: ${manifest.acceptance.linkedSchools} escolas, ${manifest.acceptance.municipalities} municípios e ${manifest.acceptance.saebRows} linhas SAEB.`);
