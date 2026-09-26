'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowLeftRight,
  Bot,
  CircleGauge,
  ClipboardCheck,
  Menu,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { type AnalysisLevel, useAtlas } from '@/components/atlas-provider';
import { WebMcpTools } from '@/components/webmcp-tools';
import { AtlasReactSelect } from '@/components/atlas-react-select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

const NAVIGATION = [
  { href: '/', label: 'Visão geral', short: 'Visão', icon: CircleGauge },
  {
    href: '/assistente',
    label: 'Assistente Atlas',
    short: 'Assistente',
    icon: Bot,
  },
  {
    href: '/plano-de-acao',
    label: 'Plano de ação',
    short: 'Plano',
    icon: ClipboardCheck,
  },
];

const PAGE_NAMES: Record<string, string> = {
  '/': 'Visão geral',
  '/assistente': 'Assistente Atlas',
  '/plano-de-acao': 'Plano de ação',
};

const ANALYSIS_LEVELS: Array<{
  value: AnalysisLevel;
  label: string;
}> = [
  { value: 'state', label: 'Estado' },
  { value: 'municipality', label: 'Município' },
  { value: 'school', label: 'Escola' },
];

function Filters({ onDone }: { onDone?: () => void }) {
  const atlas = useAtlas();
  const municipalityOptions =
    atlas.analysisLevel === 'school'
      ? atlas.schoolMunicipalities
      : atlas.municipalities;
  const selectedLevelIndex = ANALYSIS_LEVELS.findIndex(
    ({ value }) => value === atlas.analysisLevel,
  );

  return (
    <div className="space-y-6">
      <section>
        <p className="atlas-field-label">Visualizar dados de</p>
        <fieldset className="relative mt-2 grid grid-cols-3 rounded-full border border-white/30 bg-black/15 p-1 shadow-[inset_0_1px_4px_rgb(0_0_0/18%)]">
          <legend className="sr-only">Nível da análise</legend>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full border border-white/80 bg-white/10 shadow-[0_3px_12px_rgb(0_0_0/20%),inset_0_1px_0_rgb(255_255_255/12%)] transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
            style={{ transform: `translateX(${selectedLevelIndex * 100}%)` }}
          />
          {ANALYSIS_LEVELS.map(({ value, label }) => {
            const active = atlas.analysisLevel === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => atlas.setAnalysisLevel(value)}
                aria-pressed={active}
                className={`relative z-10 flex min-h-9 min-w-0 items-center justify-center rounded-full px-2 text-[11px] font-bold transition-colors duration-300 ${
                  active ? 'text-white' : 'text-white/45 hover:text-white/80'
                }`}
              >
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </fieldset>
      </section>

      <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.035] p-3.5">
        <div className="space-y-2">
          <label className="atlas-field-label" htmlFor="atlas-state">
            Estado
          </label>
          <AtlasReactSelect
            id="atlas-state"
            value={atlas.state}
            options={atlas.states.map((state) => ({
              value: state,
              label: state,
            }))}
            onChange={atlas.setStateValue}
          />
        </div>

        {atlas.analysisLevel !== 'state' && (
          <div className="space-y-2">
            <label className="atlas-field-label" htmlFor="atlas-municipality">
              {atlas.analysisLevel === 'municipality'
                ? 'Município / cidade A'
                : 'Município / cidade'}
            </label>
            <AtlasReactSelect
              id="atlas-municipality"
              value={atlas.municipality}
              options={municipalityOptions.map((municipality) => ({
                value: municipality,
                label: municipality,
              }))}
              onChange={atlas.setMunicipality}
            />
          </div>
        )}

        {atlas.analysisLevel === 'municipality' &&
          atlas.compareMunicipalities && (
            <div className="space-y-2">
              <label
                className="atlas-field-label"
                htmlFor="atlas-comparison-municipality"
              >
                Município / cidade B
              </label>
              <AtlasReactSelect
                id="atlas-comparison-municipality"
                value={atlas.comparisonMunicipality}
                options={atlas.municipalities
                  .filter((municipality) => municipality !== atlas.municipality)
                  .map((municipality) => ({
                    value: municipality,
                    label: municipality,
                  }))}
                onChange={atlas.setComparisonMunicipality}
              />
            </div>
          )}

        {atlas.analysisLevel === 'school' && (
          <div className="space-y-2">
            <label className="atlas-field-label" htmlFor="atlas-school">
              Escola
            </label>
            <AtlasReactSelect
              id="atlas-school"
              value={atlas.schoolCode}
              options={atlas.schools.map((school) => ({
                value: school.code,
                label: school.name,
              }))}
              onChange={atlas.setSchoolCode}
            />
          </div>
        )}
      </section>

      {atlas.analysisLevel === 'municipality' && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.035] p-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/7 text-[var(--lime)]">
              <ArrowLeftRight size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white/82">
                Comparar municípios
              </p>
              <p className="mt-1 text-[11px] text-white/38">
                Exibir lado a lado
              </p>
            </div>
          </div>
          <Switch
            checked={atlas.compareMunicipalities}
            onCheckedChange={atlas.setCompareMunicipalities}
            aria-label="Comparar dois municípios"
            className="data-checked:bg-[var(--lime)] data-unchecked:bg-white/15"
          />
        </div>
      )}

      {atlas.analysisLevel === 'school' && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.035] p-3.5">
          <div>
            <p className="text-xs font-bold text-white/82">Média municipal</p>
            <p className="mt-1 text-[11px] text-white/38">
              Referência nos gráficos
            </p>
          </div>
          <Switch
            checked={atlas.compareMunicipal}
            onCheckedChange={atlas.setCompareMunicipal}
            aria-label="Comparar com a média municipal"
            className="data-checked:bg-[var(--lime)] data-unchecked:bg-white/15"
          />
        </div>
      )}

      {onDone && (
        <Button
          onClick={onDone}
          className="h-11 w-full bg-[var(--lime)] text-[var(--navy)] hover:bg-[var(--lime)]/90"
        >
          Aplicar contexto
        </Button>
      )}
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="block" aria-label="Atlas — página inicial">
      <div>
        <p className="text-[17px] font-semibold tracking-[-0.02em] text-white">
          Atlas
        </p>
        <p className="text-[11px] text-white/45">Inteligência educacional</p>
      </div>
    </Link>
  );
}

export function AtlasShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const atlas = useAtlas();
  const { schoolContext } = atlas;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersClosing, setFiltersClosing] = useState(false);

  const openFilters = () => {
    setFiltersClosing(false);
    setFiltersOpen(true);
  };

  const closeFilters = () => {
    setFiltersClosing(true);
  };

  const contextLabel =
    atlas.analysisLevel === 'state'
      ? 'Maranhão'
      : atlas.analysisLevel === 'municipality'
        ? atlas.compareMunicipalities
          ? `${atlas.municipality} × ${atlas.comparisonMunicipality}`
          : atlas.municipality
        : schoolContext.school.name;

  return (
    <main className="min-h-[100dvh] bg-[var(--canvas)] text-[var(--ink)]">
      <WebMcpTools />
      <aside className="soft-scroll fixed inset-y-0 left-0 z-30 hidden w-[320px] flex-col overflow-y-auto bg-[var(--navy)] px-6 py-6 text-white lg:flex">
        <div className="-mx-6 -mt-6 flex h-[70px] shrink-0 items-center border-b border-white/10 px-8">
          <Brand />
        </div>
        <nav className="mt-8 space-y-1" aria-label="Navegação principal">
          {NAVIGATION.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${
                  active
                    ? 'bg-white/10 font-medium text-white'
                    : 'text-white/52 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={18} />
                {label}
                {active && (
                  <span className="ml-auto size-1.5 rounded-full bg-[var(--lime)]" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-7 border-t border-white/10 pt-6">
          <div className="mb-5 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35">
            <SlidersHorizontal size={13} /> Filtros da análise
          </div>
          <Filters />
        </div>
      </aside>

      {filtersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            data-closing={filtersClosing || undefined}
            className="atlas-mobile-menu-overlay absolute inset-0 bg-[var(--navy)]/45 backdrop-blur-sm"
            aria-label="Fechar filtros"
            onClick={closeFilters}
          />
          <aside
            data-closing={filtersClosing || undefined}
            onAnimationEnd={(event) => {
              if (filtersClosing && event.currentTarget === event.target) {
                setFiltersOpen(false);
                setFiltersClosing(false);
              }
            }}
            className="atlas-mobile-menu-panel soft-scroll absolute inset-y-0 left-0 w-[min(90vw,400px)] overflow-y-auto bg-[var(--navy)] p-5 pb-[calc(20px+env(safe-area-inset-bottom))] text-white shadow-2xl sm:p-6"
          >
            <div className="flex items-center justify-between">
              <Brand />
              <button
                className="grid size-11 place-items-center rounded-xl bg-white/8"
                onClick={closeFilters}
                aria-label="Fechar"
              >
                <X size={19} />
              </button>
            </div>
            <div className="mb-5 mt-9 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/35 sm:mt-10">
              <SlidersHorizontal size={13} /> Filtros da análise
            </div>
            <Filters onDone={closeFilters} />
          </aside>
        </div>
      )}

      <div className="pb-[calc(84px+env(safe-area-inset-bottom))] lg:pl-[320px] lg:pb-0">
        <header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-[var(--line)] bg-[color:rgba(242,245,241,.9)] px-4 backdrop-blur-xl sm:px-8 lg:px-10">
          <div className="flex min-w-0 items-center gap-3 lg:hidden">
            <button
              onClick={openFilters}
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--navy)] text-[var(--lime)]"
              aria-label="Abrir filtros"
              aria-expanded={filtersOpen}
            >
              <Menu size={19} />
            </button>
            <span className="truncate text-sm font-semibold">
              {PAGE_NAMES[pathname] ?? 'Atlas'}
            </span>
          </div>
          <p className="hidden text-sm text-[var(--muted)] lg:block">
            Diagnóstico{' '}
            <span className="mx-2 text-[var(--line-strong)]">/</span>{' '}
            <span className="font-medium text-[var(--ink)]">
              {PAGE_NAMES[pathname] ?? 'Atlas'}
            </span>
          </p>
          <p className="ml-3 max-w-[50vw] truncate text-xs text-[var(--muted)] sm:max-w-[460px]">
            {contextLabel}
          </p>
        </header>
        <div id="atlas-content">{children}</div>
        <footer className="border-t border-[var(--line)] px-5 py-5 text-center text-xs text-[var(--muted)] sm:px-8 lg:px-10">
          Censo/ENEM {schoolContext.school.year} · SAEB 2023
        </footer>
      </div>

      <nav
        className="fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-30 flex h-[64px] items-center justify-around rounded-2xl border border-white/10 bg-[var(--navy)] px-2 shadow-[0_18px_60px_rgb(23_43_53/28%)] lg:hidden"
        aria-label="Navegação principal móvel"
      >
        {NAVIGATION.map(({ href, short, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] ${active ? 'text-[var(--lime)]' : 'text-white/48'}`}
            >
              <Icon size={19} />
              <span className="truncate">{short}</span>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
