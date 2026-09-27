'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  Bot,
  ChartNoAxesCombined,
  ChevronRight,
  ClipboardCheck,
  Menu,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import { type AnalysisLevel, useAtlas } from '@/components/atlas-provider';
import { WebMcpTools } from '@/components/webmcp-tools';
import { AtlasReactSelect } from '@/components/atlas-react-select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

const NAVIGATION = [
  {
    href: '/',
    label: 'Visão geral',
    short: 'Visão',
    icon: ChartNoAxesCombined,
  },
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

const ANALYSIS_LEVELS: Array<{ value: AnalysisLevel; label: string }> = [
  { value: 'state', label: 'Estado' },
  { value: 'municipality', label: 'Município' },
  { value: 'school', label: 'Escola' },
];

function Filters({ onDone }: { onDone?: () => void }) {
  const atlas = useAtlas();
  const activeLevelIndex = ANALYSIS_LEVELS.findIndex(
    ({ value }) => value === atlas.analysisLevel,
  );
  const municipalityOptions =
    atlas.analysisLevel === 'school'
      ? atlas.schoolMunicipalities
      : atlas.municipalities;

  return (
    <div className="space-y-5">
      <section>
        <p className="atlas-field-label mb-2.5">Nível da análise</p>
        <fieldset className="relative grid grid-cols-3 overflow-hidden rounded-full border border-[var(--line)] bg-[var(--surface-soft)]">
          <legend className="sr-only">Nível da análise</legend>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 rounded-full bg-[var(--surface)] shadow-sm ring-1 ring-inset ring-[var(--line)] transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(${activeLevelIndex * 100}%)` }}
          />
          {ANALYSIS_LEVELS.map(({ value, label }) => {
            const active = atlas.analysisLevel === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => atlas.setAnalysisLevel(value)}
                aria-pressed={active}
                className={`relative z-10 min-h-9 min-w-0 rounded-full px-1.5 text-[11px] font-semibold transition-colors duration-300 ${
                  active
                    ? 'text-[var(--ink)]'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </fieldset>
      </section>

      <section className="space-y-3.5">
        <div className="space-y-2">
          <label className="atlas-field-label" htmlFor="atlas-year">
            Ano Censo e ENEM
          </label>
          <AtlasReactSelect
            id="atlas-year"
            value={String(atlas.year)}
            options={atlas.years.map((year) => ({
              value: String(year),
              label: String(year),
            }))}
            onChange={(value) => atlas.setYear(Number(value))}
          />
        </div>

        {atlas.saebYear !== null && atlas.analysisLevel === 'state' && (
          <div className="space-y-2">
            <label className="atlas-field-label" htmlFor="atlas-saeb-year">
              Ano SAEB
            </label>
            <AtlasReactSelect
              id="atlas-saeb-year"
              value={String(atlas.saebYear)}
              options={atlas.saebYears.map((year) => ({
                value: String(year),
                label: String(year),
              }))}
              onChange={(value) => atlas.setSaebYear(Number(value))}
            />
          </div>
        )}

        {atlas.analysisLevel !== 'state' && (
          <div className="space-y-2">
            <label className="atlas-field-label" htmlFor="atlas-municipality">
              {atlas.analysisLevel === 'municipality' &&
              atlas.compareMunicipalities
                ? 'Município A'
                : 'Município'}
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
                Município B
              </label>
              <AtlasReactSelect
                id="atlas-comparison-municipality"
                value={atlas.comparisonMunicipality}
                options={atlas.municipalities
                  .filter((item) => item !== atlas.municipality)
                  .map((item) => ({ value: item, label: item }))}
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
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <ArrowLeftRight className="shrink-0 text-[var(--teal)]" size={15} />
            <p className="text-xs font-semibold">Comparar municípios</p>
          </div>
          <Switch
            checked={atlas.compareMunicipalities}
            onCheckedChange={atlas.setCompareMunicipalities}
            aria-label="Comparar dois municípios"
          />
        </div>
      )}

      {atlas.analysisLevel === 'school' && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] p-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold">Referência municipal</p>
            <p className="mt-0.5 text-[10px] text-[var(--muted)]">
              Comparar nos gráficos
            </p>
          </div>
          <Switch
            checked={atlas.compareMunicipal}
            onCheckedChange={atlas.setCompareMunicipal}
            aria-label="Comparar com a média municipal"
          />
        </div>
      )}

      {onDone && (
        <Button onClick={onDone} className="h-11 w-full rounded-xl">
          Aplicar contexto
        </Button>
      )}
    </div>
  );
}

function Brand() {
  return (
    <Link
      href="/"
      className="block"
      aria-label="Atlas — página inicial"
    >
      <span>
        <span className="block text-base font-bold tracking-[-0.03em]">Atlas</span>
        <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
          Inteligência educacional
        </span>
      </span>
    </Link>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        setTheme(
          document.documentElement.classList.contains('dark') ? 'dark' : 'light',
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.add('atlas-theme-transition');
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem('atlas-theme', nextTheme);
    setTheme(nextTheme);
    window.setTimeout(
      () => document.documentElement.classList.remove('atlas-theme-transition'),
      220,
    );
  }

  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="grid size-9 place-items-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] transition hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      title={isDark ? 'Tema claro' : 'Tema escuro'}
    >
      {isDark ? <Moon size={16} /> : <Sun size={17} />}
    </button>
  );
}

export function AtlasShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const atlas = useAtlas();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersClosing, setFiltersClosing] = useState(false);

  const contextLabel =
    atlas.analysisLevel === 'state'
      ? 'Maranhão'
      : atlas.analysisLevel === 'municipality'
        ? atlas.compareMunicipalities
          ? `${atlas.municipality} × ${atlas.comparisonMunicipality}`
          : atlas.municipality
        : atlas.schoolContext.school.name;

  const closeFilters = () => setFiltersClosing(true);

  return (
    <main className="min-h-[100dvh] bg-[var(--canvas)] text-[var(--ink)]">
      <WebMcpTools />

      <aside className="soft-scroll fixed inset-y-0 left-0 z-30 hidden w-[300px] flex-col overflow-y-auto border-r border-[var(--line)] bg-[var(--surface)] lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-[var(--line)] px-5">
          <Brand />
        </div>

        <div className="flex-1 px-3 py-5">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--muted)]">
            Navegação
          </p>
          <nav className="space-y-1" aria-label="Navegação principal">
            {NAVIGATION.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`group flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13px] transition ${
                    active
                      ? 'bg-[var(--surface-soft)] font-semibold text-[var(--ink)]'
                      : 'text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Icon size={16} className={active ? 'text-[var(--teal)]' : ''} />
                  {label}
                  {active && <ChevronRight className="ml-auto" size={14} />}
                </Link>
              );
            })}
          </nav>

          <div className="my-5 h-px bg-[var(--line)]" />

          <div className="px-1">
            <Filters />
          </div>
        </div>

      </aside>

      {filtersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            data-closing={filtersClosing || undefined}
            className="atlas-mobile-menu-overlay absolute inset-0 bg-black/35 backdrop-blur-sm"
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
            className="atlas-mobile-menu-panel soft-scroll absolute inset-y-0 left-0 w-[min(92vw,390px)] overflow-y-auto border-r border-[var(--line)] bg-[var(--surface)] p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <Brand />
              <button
                className="grid size-10 place-items-center rounded-xl bg-[var(--surface-soft)]"
                onClick={closeFilters}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-8">
              <Filters onDone={closeFilters} />
            </div>
          </aside>
        </div>
      )}

      <div className="pb-[calc(78px+env(safe-area-inset-bottom))] lg:pl-[300px] lg:pb-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-4 backdrop-blur-xl sm:px-7 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => {
                setFiltersClosing(false);
                setFiltersOpen(true);
              }}
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface)] lg:hidden"
              aria-label="Abrir filtros"
              aria-expanded={filtersOpen}
            >
              <Menu size={18} />
            </button>
            <div className="hidden items-center gap-2 text-xs text-[var(--muted)] sm:flex">
              <span>Dashboard</span>
              <span className="text-[var(--line-strong)]">/</span>
              <span className="font-semibold text-[var(--ink)]">
                {PAGE_NAMES[pathname] ?? 'Atlas'}
              </span>
            </div>
            <span className="truncate text-sm font-semibold sm:hidden">
              {PAGE_NAMES[pathname] ?? 'Atlas'}
            </span>
          </div>

          <div className="flex min-w-0 items-center gap-2.5">
            <span className="hidden max-w-[360px] truncate rounded-full bg-[var(--surface-soft)] px-3 py-2 text-[11px] text-[var(--muted)] sm:block">
              {contextLabel}
            </span>
            <ThemeToggle />
          </div>
        </header>

        <div id="atlas-content">{children}</div>
        <footer className="border-t border-[var(--line)] px-5 py-5 text-center text-[11px] text-[var(--muted)]">
          Atlas Escolar · dados oficiais Censo/ENEM {atlas.year}
          {atlas.saebYear !== null ? ` · SAEB ${atlas.saebYear}` : ''}
        </footer>
      </div>

      <nav
        className="fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-30 flex h-[62px] items-center justify-around rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-2 shadow-[0_18px_55px_rgb(0_0_0/18%)] lg:hidden"
        aria-label="Navegação principal móvel"
      >
        {NAVIGATION.map(({ href, short, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium ${
                active ? 'text-[var(--teal)]' : 'text-[var(--muted)]'
              }`}
            >
              <Icon size={18} />
              <span className="truncate">{short}</span>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
