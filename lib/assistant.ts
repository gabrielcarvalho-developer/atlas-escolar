/** Contratos compartilhados pela interface e pela rota do assistente MCP. */

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
  engine?: string;
  iterations?: number;
  evidenceCount?: number;
};
