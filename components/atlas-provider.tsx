'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  buildSchoolContext,
  DEFAULT_SCHOOL_CODE,
  MUNICIPALITIES,
  SCHOOLS,
} from '@/lib/atlas-data';

export type AnalysisLevel = 'state' | 'municipality' | 'school';

type AtlasState = {
  analysisLevel: AnalysisLevel;
  state: string;
  municipality: string;
  comparisonMunicipality: string;
  compareMunicipalities: boolean;
  schoolCode: string;
  compareMunicipal: boolean;
};

type AtlasContextValue = AtlasState & {
  states: string[];
  municipalities: string[];
  schoolMunicipalities: string[];
  schools: typeof SCHOOLS;
  schoolContext: ReturnType<typeof buildSchoolContext>;
  setAnalysisLevel: (value: AnalysisLevel) => void;
  setStateValue: (value: string) => void;
  setMunicipality: (value: string) => void;
  setComparisonMunicipality: (value: string) => void;
  setCompareMunicipalities: (value: boolean) => void;
  setSchoolCode: (value: string) => void;
  setCompareMunicipal: (value: boolean) => void;
  selectSchoolContext: (schoolCode: string) => void;
};

const DEFAULT_STATE: AtlasState = {
  analysisLevel: 'school',
  state: 'MA',
  municipality: 'Coelho Neto',
  comparisonMunicipality: 'São Luís',
  compareMunicipalities: false,
  schoolCode: DEFAULT_SCHOOL_CODE,
  compareMunicipal: true,
};

const MUNICIPALITY_NAMES = MUNICIPALITIES.map(
  (municipality) => municipality.name,
).sort((left, right) => left.localeCompare(right, 'pt-BR'));

const AtlasContext = createContext<AtlasContextValue | null>(null);

export function AtlasProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AtlasState>(DEFAULT_STATE);

  useEffect(() => {
    const stored = window.localStorage.getItem('atlas-settings');
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Partial<AtlasState>;
      const storedSchool = SCHOOLS.find(
        (school) => school.code === parsed.schoolCode,
      );
      const storedMunicipality = storedSchool?.municipality;
      const parsedComparison = parsed.comparisonMunicipality;
      const storedComparison =
        parsedComparison && MUNICIPALITY_NAMES.includes(parsedComparison)
          ? parsedComparison
          : DEFAULT_STATE.comparisonMunicipality;
      const timer = window.setTimeout(() => {
        setSettings({
          ...DEFAULT_STATE,
          ...parsed,
          state: storedSchool?.state ?? DEFAULT_STATE.state,
          municipality:
            storedSchool?.municipality ?? DEFAULT_STATE.municipality,
          comparisonMunicipality:
            storedComparison === storedMunicipality
              ? (MUNICIPALITY_NAMES.find(
                  (municipality) => municipality !== storedMunicipality,
                ) ?? DEFAULT_STATE.comparisonMunicipality)
              : storedComparison,
          schoolCode: storedSchool?.code ?? DEFAULT_STATE.schoolCode,
        });
      }, 0);
      return () => window.clearTimeout(timer);
    } catch {
      window.localStorage.removeItem('atlas-settings');
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('atlas-settings', JSON.stringify(settings));
  }, [settings]);

  const states = useMemo(
    () => [...new Set(SCHOOLS.map((school) => school.state))].sort(),
    [],
  );
  const municipalities = useMemo(() => MUNICIPALITY_NAMES, []);
  const schoolMunicipalities = useMemo(
    () =>
      [
        ...new Set(
          SCHOOLS.filter((school) => school.state === settings.state).map(
            (school) => school.municipality,
          ),
        ),
      ].sort(),
    [settings.state],
  );
  const schools = useMemo(
    () =>
      SCHOOLS.filter(
        (school) =>
          school.state === settings.state &&
          school.municipality === settings.municipality,
      ),
    [settings.state, settings.municipality],
  );
  const schoolContext = useMemo(
    () => buildSchoolContext(settings.schoolCode, settings.compareMunicipal),
    [settings.schoolCode, settings.compareMunicipal],
  );

  const setAnalysisLevel = useCallback((analysisLevel: AnalysisLevel) => {
    setSettings((current) => {
      if (analysisLevel !== 'school') return { ...current, analysisLevel };

      const selectedSchool = SCHOOLS.find(
        (school) => school.code === current.schoolCode,
      );
      const fallbackSchool =
        SCHOOLS.find(
          (school) =>
            school.state === current.state &&
            school.municipality === current.municipality,
        ) ?? SCHOOLS[0];

      return {
        ...current,
        analysisLevel,
        municipality:
          selectedSchool?.municipality ?? fallbackSchool.municipality,
        schoolCode: selectedSchool?.code ?? fallbackSchool.code,
      };
    });
  }, []);

  const setStateValue = useCallback((state: string) => {
    const municipality =
      SCHOOLS.find((school) => school.state === state)?.municipality ?? '';
    const schoolCode =
      SCHOOLS.find(
        (school) =>
          school.state === state && school.municipality === municipality,
      )?.code ?? '';
    setSettings((current) => ({ ...current, state, municipality, schoolCode }));
  }, []);

  const setMunicipality = useCallback((municipality: string) => {
    setSettings((current) => {
      const schoolCode =
        SCHOOLS.find(
          (school) =>
            school.state === current.state &&
            school.municipality === municipality,
        )?.code ?? '';
      const comparisonMunicipality =
        current.comparisonMunicipality === municipality
          ? (MUNICIPALITY_NAMES.find((item) => item !== municipality) ?? '')
          : current.comparisonMunicipality;
      return {
        ...current,
        municipality,
        comparisonMunicipality,
        schoolCode: schoolCode || current.schoolCode,
      };
    });
  }, []);

  const setComparisonMunicipality = useCallback(
    (comparisonMunicipality: string) =>
      setSettings((current) =>
        comparisonMunicipality === current.municipality
          ? current
          : { ...current, comparisonMunicipality },
      ),
    [],
  );
  const setCompareMunicipalities = useCallback(
    (compareMunicipalities: boolean) =>
      setSettings((current) => ({ ...current, compareMunicipalities })),
    [],
  );

  const setSchoolCode = useCallback(
    (schoolCode: string) =>
      setSettings((current) => ({ ...current, schoolCode })),
    [],
  );
  const setCompareMunicipal = useCallback(
    (compareMunicipal: boolean) =>
      setSettings((current) => ({ ...current, compareMunicipal })),
    [],
  );
  const selectSchoolContext = useCallback((schoolCode: string) => {
    const school = SCHOOLS.find((item) => item.code === schoolCode);
    if (!school) return;
    setSettings((current) => ({
      ...current,
      analysisLevel: 'school',
      state: school.state,
      municipality: school.municipality,
      schoolCode: school.code,
    }));
  }, []);

  const value: AtlasContextValue = {
    ...settings,
    states,
    municipalities,
    schoolMunicipalities,
    schools,
    schoolContext,
    setAnalysisLevel,
    setStateValue,
    setMunicipality,
    setComparisonMunicipality,
    setCompareMunicipalities,
    setSchoolCode,
    setCompareMunicipal,
    selectSchoolContext,
  };

  return (
    <AtlasContext.Provider value={value}>{children}</AtlasContext.Provider>
  );
}

export function useAtlas() {
  const context = useContext(AtlasContext);
  if (!context) throw new Error('useAtlas must be used inside AtlasProvider');
  return context;
}
