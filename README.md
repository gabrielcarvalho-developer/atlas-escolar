# Atlas Escolar — Next.js

Aplicação em Next.js 16, TypeScript, Tailwind CSS e Recharts. A execução e a publicação usam Vinext/Cloudflare Workers para manter o assistente no servidor sem expor credenciais do modelo.

## Dados reais

As entregas ficam em:

```text
data/incoming/
├── bases/
│   ├── censo_enem_municipios_ma_2025.csv
│   ├── censo_municipios_ma_2025.csv
│   ├── enem_censo_indicadores_infraestrutura_2025.csv
│   └── saeb_contexto_estadual_ma_2023.csv
└── documentacao/
    ├── dicionario_dados_atlas_escolar.json
    ├── Dicionario_de_Dados_ATLAS_Escolar.xlsx
    └── README_Entrega_Dados_ATLAS_Escolar.md
```

`npm run data:build` valida hash SHA-256, BOM UTF-8, cabeçalhos, tipos, chaves, nulos, fórmulas, vínculo municipal e totais de aceite. Em seguida, gera os artefatos consumidos pelo site em `lib/generated/` e o manifesto público em `public/data/manifest.json`.

Critérios de aceite atuais: 10.080 escolas públicas, 217 municípios, 925 escolas públicas com Ensino Médio, 821 escolas do ENEM, 711 vinculadas ao Censo, 110 não vinculadas, 60.992 registros do ENEM e 30 linhas de contexto SAEB.

Ao substituir uma entrega, preserve os nomes dos arquivos e atualize o dicionário JSON com os novos hashes, esquemas, contagens e regras. O build falha se os dados divergirem da documentação.

## Assistente com Llama

O endpoint `POST /api/assistant` aceita a pergunta e o `CO_ESCOLA`, monta um recorte estruturado da evidência e consulta qualquer provedor Llama compatível com a API de chat da OpenAI. Copie `.env.example` para `.env.local` e configure:

```dotenv
LLAMA_API_URL=https://seu-provedor/v1
LLAMA_API_KEY=seu-segredo
LLAMA_MODEL=identificador-do-modelo
```

Também é aceita diretamente a URL-base da conta do Cloudflare Workers AI (`https://api.cloudflare.com/client/v4/accounts/{id}`); o Atlas acrescenta o caminho OpenAI-compatible automaticamente.

Sem essas três variáveis, o produto continua operacional em modo local auditável, com respostas determinísticas baseadas nos mesmos dados. A chave nunca é enviada ao navegador.

## Executar localmente

```bash
npm install
npm run dev
```

A aplicação Vinext fica em `http://localhost:3001`. Para comparar a implementação no runtime original do Next.js, use `npm run dev:next`.

## Verificações

```bash
npm run data:build
npm run lint
npm run build
npm run build:next
```

## Limites metodológicos

- médias do ENEM devem ser lidas com a contagem de participantes da respectiva área e agregadas com ponderação;
- amostras abaixo de 30 são sinalizadas;
- o SAEB é somente contexto estadual, pois identificadores escolares e municipais da origem estão mascarados;
- a entrega não contém INSE escolar e o Atlas não cria esse indicador;
- as 110 escolas do ENEM não vinculadas ao Censo entram nas médias municipais, mas não na consulta individual;
- antes de exposição pública, a origem, a autorização de uso e o processo de vinculação da base identificada do ENEM 2025 devem ser formalmente homologados pelo responsável pelos dados.

## Funcionalidades

- filtros por código oficial de estado, município e escola;
- comparação com agregados municipais;
- infraestrutura, ENEM 2025 e contexto estadual SAEB 2023;
- assistente Llama com resposta local de contingência e fontes visíveis;
- plano de ação e relatório PDF baseados no contexto selecionado;
- ferramenta WebMCP para selecionar a escola por `CO_ESCOLA`.
