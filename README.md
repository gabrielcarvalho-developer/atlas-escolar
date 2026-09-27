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

`npm run data:build` descobre automaticamente os anos pelos nomes dos arquivos, valida hash SHA-256 das entregas documentadas, BOM UTF-8, cabeçalhos, tipos, chaves, fórmulas e vínculo municipal. Em seguida, gera os artefatos multi-ano consumidos pelo site em `lib/generated/` e o manifesto público em `public/data/manifest.json`.

Critérios de aceite atuais: 10.080 escolas públicas, 217 municípios, 925 escolas públicas com Ensino Médio, 821 escolas do ENEM, 711 vinculadas ao Censo, 110 não vinculadas, 60.992 registros do ENEM e 30 linhas de contexto SAEB.

Para adicionar um ano, inclua em `data/incoming/bases/` o trio Censo/ENEM com o sufixo `_AAAA.csv`; bases SAEB usam `saeb_contexto_estadual_ma_AAAA.csv` e podem ser incluídas de forma independente. O esquema deve permanecer igual ao da família. Veja o [guia de bases multi-ano](data/incoming/documentacao/GUIA_BASES_MULTIANO.md).

## Assistente via MCP

O assistente usa um único fluxo: `Next.js -> API Python/LangGraph -> MCP -> dados`. A API entrega status e resposta ao navegador por SSE (`POST /api/agent/stream`), com keep-alive durante o processamento. Não há resposta Llama direta nem fallback determinístico no Next.js. Se a API ou o MCP estiverem indisponíveis, a interface informa a indisponibilidade em vez de gerar uma resposta por outro mecanismo.

O servidor MCP expõe oito ferramentas auditáveis e é iniciado por `stdio` pela API Python. Para produção, `MCP_SERVER_URL` permite trocar o subprocesso local por um endpoint MCP Streamable HTTP sem alterar o agente.

Copie `python/.env.example` para `python/.env.local`, escolha `LLM_PROVIDER` e preencha somente as credenciais do provedor escolhido. Para Cloudflare Workers AI, a URL curta da conta (`https://api.cloudflare.com/client/v4/accounts/{id}`) é normalizada automaticamente para a API OpenAI-compatible.

As credenciais do modelo ficam somente na API Python e nunca são enviadas ao navegador. Sem a configuração válida do agente, a interface falha explicitamente e não troca silenciosamente de motor.

## Executar localmente

```bash
npm install
python -m venv python/.venv
.\python\.venv\Scripts\Activate.ps1
python -m pip install -e "./python[dev]"
```

Ative o ambiente virtual e inicie os serviços em dois terminais:

```bash
# terminal 1 (com o ambiente virtual ativo)
npm run dev:agent

# terminal 2
npm run dev
```

Configure `ATLAS_AGENT_URL=http://localhost:8001` no `.env.local` da raiz. A aplicação Vinext fica em `http://localhost:3001` e a prontidão do agente pode ser verificada em `http://localhost:8001/health`. Para comparar a implementação no runtime original do Next.js, use `npm run dev:next`.

Em produção, publique a API Python em um runtime próprio, configure a URL HTTPS em `ATLAS_AGENT_URL` e use o mesmo segredo forte em `ATLAS_AGENT_TOKEN` nos dois serviços. Se o MCP também for remoto, configure o endpoint Streamable HTTP completo em `MCP_SERVER_URL`.

## Verificações

Com o ambiente virtual Python ativo:

```bash
npm run data:build
npm run lint
npm run build
npm run build:next
npm run check:agent
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
- infraestrutura e ENEM filtráveis por ano, com séries históricas automáticas;
- contexto estadual SAEB com seletor próprio de anos disponíveis;
- comparação temporal de notas e infraestrutura em escola, município e estado;
- assistente LangGraph com acesso exclusivo às ferramentas de dados via MCP;
- plano de ação e relatório PDF baseados no contexto selecionado;
- ferramenta WebMCP para selecionar a escola por `CO_ESCOLA`.
