# Entrega de dados — ATLAS Escolar

**Escopo:** Maranhão  
**Versão da documentação:** 1.0  
**Data:** 12/09/2026

Este pacote documenta as quatro bases finais destinadas à equipe responsável pelas dashboards. O arquivo `Dicionario_de_Dados_ATLAS_Escolar.xlsx` é a referência funcional e o arquivo `dicionario_dados_atlas_escolar.json` oferece a mesma documentação em formato legível por sistemas.

## Qual base usar

| Visão | Arquivo | Unidade de análise | Chave |
|---|---|---|---|
| Escola | `enem_censo_indicadores_infraestrutura_2025.csv` | 1 escola identificada | `CO_ESCOLA` |
| Município — somente Censo | `censo_municipios_ma_2025.csv` | 1 município | `CO_MUNICIPIO` |
| Município — Censo + ENEM | `censo_enem_municipios_ma_2025.csv` | 1 município | `CO_MUNICIPIO` |
| Contexto estadual | `saeb_contexto_estadual_ma_2023.csv` | dimensão × categoria × etapa | `DIMENSAO + CATEGORIA + ETAPA` |

Na dashboard municipal integrada, não carregue simultaneamente `censo_municipios_ma_2025.csv`: as 41 colunas do Censo já estão preservadas na base integrada, e a carga conjunta pode duplicar métricas.

## Configuração de importação

- Codificação: UTF-8 com BOM (`utf-8-sig`).
- Delimitador: ponto e vírgula (`;`).
- Separador decimal: ponto (`.`).
- Final de linha: CRLF.
- Importe `CO_ESCOLA` e `CO_MUNICIPIO` como texto. Eles são identificadores, não medidas.
- O ano do Censo e do ENEM é 2025 e está no nome dos arquivos. O SAEB contém `ANO_REFERENCIA = 2023` e `UF = MA` no próprio arquivo.

## Regras obrigatórias de agregação

Nunca calcule uma média simples das médias municipais.

- ENEM: ponderar `MEDIA_CN`, `MEDIA_CH`, `MEDIA_LC` e `MEDIA_MT` pela respectiva `QTD_PARTICIPANTES_*`.
- Redação geral: ponderar por `QTD_PRESENTES_REDACAO`.
- Redação sem problemas: ponderar por `QTD_REDACOES_SEM_PROBLEMAS`.
- Percentuais escolares do Censo: recompor pelos numeradores e denominadores ou ponderar por `QTD_ESCOLAS`.
- Percentuais de salas: usar `TOTAL_SALAS_UTILIZADAS` como denominador/peso.
- Banda larga entre escolas conectadas: usar `QTD_ESCOLAS_COM_INTERNET` como denominador.

## Nulos e mensagens da interface

- Média de prova nula na base escolar: mostrar **“Sem participantes presentes”**, nunca `0`.
- Média de redação sem problemas nula: mostrar **“Sem redação válida”**.
- `IN_BANDA_LARGA` nulo com `IN_INTERNET = 0`: mostrar **“Não possui internet / banda larga não aplicável”**.
- No SAEB, métricas nulas ou grupos com menos de 30 estudantes de peso: mostrar **“Dados insuficientes”**, nunca `0`.

## Alertas de amostra e cobertura

- Sinalize **baixa quantidade de participantes** quando a área exibida tiver menos de 30 participantes no município.
- `PCT_ESCOLAS_ENSINO_MEDIO_IDENTIFICADAS_NO_ENEM` mede 711 escolas identificadas sobre 925 escolas públicas com Ensino Médio. É uma cobertura conservadora porque 110 códigos especiais do ENEM, embora tenham município conhecido, não puderam ser vinculados ao Censo.
- As 110 escolas não vinculadas representam 500 dos 60.992 registros do ENEM (aproximadamente 0,82%). Elas entram nas médias municipais, mas não na consulta individual por escola.

## Tratamentos já realizados

- Três valores especiais `88888` em `QT_DESKTOP_ALUNO` foram tratados como ausentes antes da agregação municipal. O total válido é 12.239 desktops.
- Escolas sem internet foram tratadas como sem banda larga no indicador municipal `PCT_ESCOLAS_BANDA_LARGA`.
- Todas as 41 colunas municipais do Censo foram preservadas na base integrada.
- As médias municipais do ENEM foram calculadas a partir dos participantes, não por média simples das escolas.

## Valores de aceite

| Controle | Valor esperado |
|---|---:|
| Escolas públicas no Censo | 10.080 |
| Municípios | 217 |
| Escolas públicas com Ensino Médio | 925 |
| Escolas do ENEM | 821 |
| Escolas vinculadas ao Censo | 711 |
| Escolas não vinculadas | 110 |
| Registros do ENEM | 60.992 |
| Participantes CN / MT | 44.840 |
| Participantes CH / LC / Redação | 46.859 |
| Escolas no contexto SAEB | 3.861 |
| Linhas do resumo SAEB | 30 |

## Limite do SAEB

O arquivo SAEB deve ser usado somente para o contexto estadual do Maranhão e seus recortes de área, localização e nível socioeconômico. Os identificadores de escola e município dos microdados de origem são mascarados pelo Inep; portanto, o SAEB não deve ser cruzado com as bases identificadas de escola ou município.

## Conteúdo do dicionário Excel

- visão geral das quatro bases;
- uma aba de campos para cada arquivo;
- códigos e rótulos categóricos;
- regras de cálculo e apresentação;
- matriz de validações executadas.

Em caso de dúvida sobre um indicador, consulte primeiro as colunas **Cálculo / denominador** e **Orientação para dashboard** na aba correspondente.
