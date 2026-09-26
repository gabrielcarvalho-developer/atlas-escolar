'use client';

import { useEffect } from 'react';
import { SCHOOLS } from '@/lib/atlas-data';
import { useAtlas } from '@/components/atlas-provider';

type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

export function WebMcpTools() {
  const { selectSchoolContext } = useAtlas();

  useEffect(() => {
    const modelContext = (
      document as Document & { modelContext?: ModelContext }
    ).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();

    const registration = modelContext.registerTool(
      {
        name: 'set_school_context',
        title: 'Selecionar contexto escolar',
        description: 'Seleciona uma escola no painel Atlas.',
        inputSchema: {
          type: 'object',
          properties: {
            schoolCode: {
              type: 'string',
              description:
                'Código oficial CO_ESCOLA da escola disponível no Atlas.',
            },
          },
          required: ['schoolCode'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input: unknown) {
          const value = input as { schoolCode?: unknown };
          if (typeof value.schoolCode !== 'string')
            throw new Error('schoolCode deve ser uma string.');
          const school = SCHOOLS.find((item) => item.code === value.schoolCode);
          if (!school)
            throw new Error(
              'Escola não encontrada no conjunto de dados atual.',
            );
          selectSchoolContext(school.code);
          return {
            schoolCode: school.code,
            schoolName: school.name,
            municipality: school.municipality,
            state: school.state,
          };
        },
      },
      { signal: lifecycle.signal },
    );

    void Promise.resolve(registration).catch(() => undefined);
    return () => lifecycle.abort();
  }, [selectSchoolContext]);

  return null;
}
