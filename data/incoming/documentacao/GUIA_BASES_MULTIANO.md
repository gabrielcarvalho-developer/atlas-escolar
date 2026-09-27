# Guia de bases multi-ano

O Atlas descobre automaticamente arquivos CSV em `data/incoming/bases/` pelo
ano presente no nome. Não é necessário alterar código para incluir um novo ano.

## Censo Escolar + ENEM

Cada ano precisa ser entregue como um conjunto completo de três arquivos:

```text
enem_censo_indicadores_infraestrutura_AAAA.csv
censo_municipios_ma_AAAA.csv
censo_enem_municipios_ma_AAAA.csv
```

Substitua `AAAA` pelo ano com quatro dígitos, por exemplo:

```text
enem_censo_indicadores_infraestrutura_2024.csv
censo_municipios_ma_2024.csv
censo_enem_municipios_ma_2024.csv
```

O primeiro arquivo alimenta a visão de escola. O segundo é usado para validar a
parte censitária. O terceiro alimenta as visões municipal e estadual. O build
rejeita um ano se qualquer um dos três estiver ausente.

## SAEB

Cada ano do SAEB é independente:

```text
saeb_contexto_estadual_ma_AAAA.csv
```

Todas as linhas precisam ter `ANO_REFERENCIA` igual ao ano informado no nome.
Como os identificadores da origem são mascarados, o SAEB continua restrito ao
contexto estadual.

## Contrato dos CSVs

- codificação UTF-8 com BOM;
- delimitador ponto e vírgula (`;`);
- separador decimal ponto (`.`);
- uma linha de cabeçalho;
- nomes, ordem e tipos das colunas idênticos aos arquivos de referência atuais;
- `CO_ESCOLA` e `CO_MUNICIPIO` preservados como texto, inclusive zeros à esquerda;
- chaves sem nulos e sem duplicidades;
- fórmulas derivadas e vínculo Censo/base municipal consistentes.

O arquivo `dicionario_dados_atlas_escolar.json` contém o esquema de referência.
Para um arquivo novo que ainda não esteja registrado no dicionário, o build usa
automaticamente o esquema da mesma família e permite que quantidades de linhas e
nulos variem entre anos. Se o arquivo for adicionado ao dicionário, hash, contagem
de linhas e contagem de nulos passam a ser validados estritamente como uma entrega
homologada.

## Publicação

Depois de copiar os arquivos para `data/incoming/bases/`, execute:

```bash
npm run data:build
```

O comando atualiza `lib/generated/atlas-real-data.json` e
`public/data/manifest.json`. `npm run dev` e os builds já executam essa etapa
automaticamente. Os seletores de ano, gráficos históricos e consultas do
assistente passam a usar os anos descobertos.

Comparações usam apenas observações existentes. Se os anos disponíveis forem
2022 e 2024, por exemplo, o Atlas compara 2024 com 2022 e informa explicitamente
esses anos; ele não cria dados para 2023.
