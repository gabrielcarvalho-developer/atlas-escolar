'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Building2,
  Check,
  ListChecks,
  MapPin,
  UsersRound,
} from 'lucide-react';
import { AtlasShell } from '@/components/atlas-shell';
import { useAtlas } from '@/components/atlas-provider';
import { buildReport } from '@/lib/report';
import { Button } from '@/components/ui/button';

type ImprovementDefinition = {
  id: 'infrastructure' | 'pedagogy';
  number: string;
  title: string;
  description: string;
  impact: string;
  reference: string;
  icon: typeof Building2;
};

export default function ActionPlanPage() {
  const { schoolContext: context } = useAtlas();
  const [downloaded, setDownloaded] = useState(false);

  const improvements = useMemo<ImprovementDefinition[]>(() => {
    const pedagogicalImpact = context.lowSampleAreas.length
      ? 'Atenção à amostra'
      : 'Prioridade pedagógica';
    const lowestArea = context.lowestPerformanceArea;
    const criticalSchool =
      context.school.infrastructure[context.criticalFactor] * 10;
    const criticalMunicipal =
      context.municipalInfrastructure[context.criticalFactor] * 10;

    return [
      {
        id: 'infrastructure',
        number: '01',
        title: context.criticalFactorName,
        description: `É o menor índice composto de infraestrutura da escola, com ${criticalSchool.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%.`,
        impact: 'Prioridade de infraestrutura',
        reference: `${criticalMunicipal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%.`,
        icon: Building2,
      },
      {
        id: 'pedagogy',
        number: '02',
        title: lowestArea?.label ?? 'Cobertura dos dados do ENEM',
        description: lowestArea
          ? `É a menor média válida da escola no ENEM: ${lowestArea.schoolAverage?.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pontos.`
          : 'Não há média válida por área para esta escola na entrega atual.',
        impact: pedagogicalImpact,
        reference: lowestArea
          ? `${lowestArea.municipalAverage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pontos · ${lowestArea.schoolParticipants} ${lowestArea.schoolParticipants === 1 ? 'participante' : 'participantes'}.`
          : 'A disponibilidade e a cobertura precisam ser verificadas antes da análise.',
        icon: UsersRound,
      },
    ];
  }, [context]);

  function downloadReport() {
    const report = buildReport(context);
    const url = URL.createObjectURL(report.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = report.filename;
    link.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    window.setTimeout(() => setDownloaded(false), 2200);
  }

  return (
    <AtlasShell>
      <div className="atlas-page max-w-[1340px]">
        <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="atlas-eyebrow">Leitura objetiva</p>
            <h1 className="atlas-page-heading mt-3">Plano de ação.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--muted)] sm:text-base">
              Comece pelos sinais que mais pedem atenção na escola selecionada.
            </p>
          </div>
          <div className="flex w-fit items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3.5 py-2 text-xs font-bold text-[var(--muted)] shadow-sm">
            <ListChecks size={15} className="text-[var(--teal)]" />
            {improvements.length} prioridades identificadas
          </div>
        </section>

        <section className="mt-9">
          <div className="max-w-2xl">
            <p className="atlas-eyebrow">Pontos de melhoria</p>
            <h2 className="atlas-section-title">O que precisa melhorar</h2>
            <p className="atlas-section-copy">
              A priorização combina infraestrutura, desempenho e cobertura dos
              dados disponíveis.
            </p>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {improvements.map((improvement) => {
              const Icon = improvement.icon;
              return (
                <article
                  key={improvement.id}
                  className="atlas-card relative flex min-h-[280px] flex-col overflow-hidden"
                >
                  <div className="absolute inset-y-0 left-0 w-1.5 bg-[var(--teal)]" />
                  <div className="absolute -right-12 -top-14 size-44 rounded-full bg-[var(--teal-soft)]/65" />

                  <div className="relative flex flex-1 flex-col p-5 pl-6 sm:p-7 sm:pl-8">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--teal-soft)] text-[var(--teal)] ring-1 ring-[var(--teal)]/10">
                          <Icon size={20} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--teal)]">
                            Prioridade {improvement.number}
                          </p>
                          <span className="mt-1.5 inline-flex max-w-full rounded-full bg-[#eaf3c8] px-3 py-1 text-[11px] font-bold leading-snug text-[#536a14]">
                            {improvement.impact}
                          </span>
                        </div>
                      </div>
                      <span
                        aria-hidden="true"
                        className="select-none text-4xl font-extrabold leading-none tracking-[-0.06em] text-[var(--teal)]/10 sm:text-5xl"
                      >
                        {improvement.number}
                      </span>
                    </div>

                    <h3 className="mt-7 text-2xl font-extrabold leading-tight tracking-[-0.04em] sm:text-[1.75rem]">
                      {improvement.title}
                    </h3>
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--muted)] sm:text-[15px]">
                      {improvement.description}
                    </p>
                  </div>

                  <div className="relative ml-1.5 flex items-start gap-3 border-t border-[var(--line)] bg-[var(--canvas)]/75 px-5 py-4 sm:px-7">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-[var(--teal)] shadow-sm ring-1 ring-[var(--line)]">
                      <MapPin size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">
                        Referência municipal
                      </p>
                      <p className="mt-1 text-sm font-bold leading-relaxed text-[var(--ink)]">
                        {improvement.reference}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="relative mb-2 mt-6 overflow-hidden rounded-[12px] bg-[var(--navy)] p-5 text-white shadow-[0_22px_70px_rgb(18_47_56/17%)] sm:p-7 lg:p-8">
          <div className="absolute -right-16 -top-24 size-72 rounded-full border-[56px] border-white/[0.04]" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--lime)] text-[var(--navy)]">
                <ArrowDownToLine size={21} />
              </div>
              <div>
                <p className="text-xl font-bold tracking-[-0.035em] sm:text-2xl">
                  Leve o diagnóstico para a reunião
                </p>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/58">
                  Baixe um resumo visual com os indicadores e pontos de melhoria
                  desta escola.
                </p>
              </div>
            </div>
            <Button
              onClick={downloadReport}
              className="h-12 w-full shrink-0 rounded-xl bg-[var(--lime)] px-5 font-bold text-[var(--navy)] hover:bg-white lg:w-fit"
            >
              {downloaded ? (
                <>
                  <Check size={17} /> Relatório baixado
                </>
              ) : (
                <>
                  Gerar relatório PDF <ArrowRight size={17} />
                </>
              )}
            </Button>
            <span className="sr-only" aria-live="polite">
              {downloaded ? 'Relatório baixado com sucesso' : ''}
            </span>
          </div>
        </section>
      </div>
    </AtlasShell>
  );
}
