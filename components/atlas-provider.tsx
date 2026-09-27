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
  AVAILABLE_YEARS,
  buildSchoolContext,
  DEFAULT_SAEB_YEAR,
  DEFAULT_SCHOOL_CODE,
  DEFAULT_YEAR,
  getMunicipalities,
  getSchools,
  SAEB_AVAILABLE_YEARS,
  type School,
} from '@/lib/atlas-data';

export type AnalysisLevel = 'state' | 'municipality' | 'school';

type AtlasState = {
  analysisLevel: AnalysisLevel;
  year: number;
  saebYear: number | null;
  state: string;
  municipality: string;
  comparisonMunicipality: string;
  compareMunicipalities: boolean;
  schoolCode: string;
  compareMunicipal: boolean;
};

type AtlasContextValue = AtlasState & {
  years: number[];
  saebYears: number[];
  states: string[];
  municipalities: string[];
  schoolMunicipalities: string[];
  schools: School[];
  schoolContext: ReturnType<typeof buildSchoolContext>;
  setAnalysisLevel: (value: AnalysisLevel) => void;
  setYear: (value: number) => void;
  setSaebYear: (value: number) => void;
  setStateValue: (value: string) => void;
  setMunicipality: (value: string) => void;
  setComparisonMunicipality: (value: string) => void;
  setCompareMunicipalities: (value: boolean) => void;
  setSchoolCode: (value: string) => void;
  setCompareMunicipal: (value: boolean) => void;
  selectSchoolContext: (schoolCode: string) => void;
};

const defaultSchools = getSchools(DEFAULT_YEAR);
const defaultSchool =
  defaultSchools.find((school) => school.code === DEFAULT_SCHOOL_CODE) ??
  defaultSchools[0];
const defaultMunicipalities = getMunicipalities(DEFAULT_YEAR).map(
  (municipality) => municipality.name,
);

const DEFAULT_STATE: AtlasState = {
  analysisLevel: 'school',
  year: DEFAULT_YEAR,
  saebYear: DEFAULT_SAEB_YEAR,
  state: 'MA',
  municipality: defaultSchool?.municipality ?? defaultMunicipalities[0] ?? '',
  comparisonMunicipality:
    defaultMunicipalities.find(
      (municipality) => municipality !== defaultSchool?.municipality,
    ) ?? '',
  compareMunicipalities: false,
  schoolCode: defaultSchool?.code ?? '',
  compareMunicipal: true,
};

function municipalityNames(year: number) {
  return getMunicipalities(year)
    .map((municipality) => municipality.name)
    .sort((left, right) => left.localeCompare(right, 'pt-BR'));
}

function validSettings(candidate: Partial<AtlasState>): AtlasState {
  const year =
    typeof candidate.year === 'number' &&
    AVAILABLE_YEARS.includes(candidate.year)
      ? candidate.year
      : DEFAULT_YEAR;
  const yearSchools = getSchools(year);
  const names = municipalityNames(year);
  const requestedSchool = yearSchools.find(
    (school) => school.code === candidate.schoolCode,
  );
  const requestedMunicipality =
    typeof candidate.municipality === 'string' &&
    names.includes(candidate.municipality)
      ? candidate.municipality
      : undefined;
  const school =
    requestedSchool ??
    yearSchools.find((item) => item.municipality === requestedMunicipality) ??
    yearSchools[0];
  const municipality =
    school?.municipality ?? requestedMunicipality ?? names[0] ?? '';
  const comparisonMunicipality =
    typeof candidate.comparisonMunicipality === 'string' &&
    names.includes(candidate.comparisonMunicipality) &&
    candidate.comparisonMunicipality !== municipality
      ? candidate.comparisonMunicipality
      : (names.find((name) => name !== municipality) ?? '');
  const saebYear =
    typeof candidate.saebYear === 'number' &&
    SAEB_AVAILABLE_YEARS.includes(candidate.saebYear)
      ? candidate.saebYear
      : DEFAULT_SAEB_YEAR;

  return {
    ...DEFAULT_STATE,
    ...candidate,
    year,
    saebYear,
    state: school?.state ?? 'MA',
    municipality,
    comparisonMunicipality,
    schoolCode: school?.code ?? '',
  };
}

const AtlasContext = createContext<AtlasContextValue | null>(null);

export function AtlasProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AtlasState>(DEFAULT_STATE);

  useEffect(() => {
    const stored = window.localStorage.getItem('atlas-settings');
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Partial<AtlasState>;
      const timer = window.setTimeout(
        () => setSettings(validSettings(parsed)),
        0,
      );
      return () => window.clearTimeout(timer);
    } catch {
      window.localStorage.removeItem('atlas-settings');
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('atlas-settings', JSON.stringify(settings));
  }, [settings]);

  const yearSchools = useMemo(() => getSchools(settings.year), [settings.year]);
  const states = useMemo(
    () => [...new Set(yearSchools.map((school) => school.state))].sort(),
    [yearSchools],
  );
  const municipalities = useMemo(
    () => municipalityNames(settings.year),
    [settings.year],
  );
  const schoolMunicipalities = useMemo(
    () =>
      [
        ...new Set(
          yearSchools
            .filter((school) => school.state === settings.state)
            .map((school) => school.municipality),
        ),
      ].sort((left, right) => left.localeCompare(right, 'pt-BR')),
    [settings.state, yearSchools],
  );
  const schools = useMemo(
    () =>
      yearSchools.filter(
        (school) =>
          school.state === settings.state &&
          school.municipality === settings.municipality,
      ),
    [settings.state, settings.municipality, yearSchools],
  );
  const schoolContext = useMemo(
    () =>
      buildSchoolContext(
        settings.schoolCode,
        settings.compareMunicipal,
        settings.year,
      ),
    [settings.schoolCode, settings.compareMunicipal, settings.year],
  );

  const setAnalysisLevel = useCallback((analysisLevel: AnalysisLevel) => {
    setSettings((current) => ({ ...current, analysisLevel }));
  }, []);

  const setYear = useCallback((year: number) => {
    if (!AVAILABLE_YEARS.includes(year)) return;
    setSettings((current) => {
      const nextSchools = getSchools(year);
      const names = municipalityNames(year);
      const sameSchool = nextSchools.find(
        (school) => school.code === current.schoolCode,
      );
      const nextSchool =
        sameSchool ??
        nextSchools.find(
          (school) => school.municipality === current.municipality,
        ) ??
        nextSchools[0];
      const municipality = nextSchool?.municipality ?? names[0] ?? '';
      return {
        ...current,
        year,
        state: nextSchool?.state ?? 'MA',
        municipality,
        comparisonMunicipality:
          names.includes(current.comparisonMunicipality) &&
          current.comparisonMunicipality !== municipality
            ? current.comparisonMunicipality
            : (names.find((name) => name !== municipality) ?? ''),
        schoolCode: nextSchool?.code ?? '',
      };
    });
  }, []);

  const setSaebYear = useCallback((saebYear: number) => {
    if (!SAEB_AVAILABLE_YEARS.includes(saebYear)) return;
    setSettings((current) => ({ ...current, saebYear }));
  }, []);

  const setStateValue = useCallback((state: string) => {
    setSettings((current) => {
      const nextSchools = getSchools(current.year);
      const school = nextSchools.find((item) => item.state === state);
      return {
        ...current,
        state,
        municipality: school?.municipality ?? '',
        schoolCode: school?.code ?? '',
      };
    });
  }, []);

  const setMunicipality = useCallback((municipality: string) => {
    setSettings((current) => {
      const yearSchools = getSchools(current.year);
      const school = yearSchools.find(
        (item) =>
          item.state === current.state && item.municipality === municipality,
      );
      const names = municipalityNames(current.year);
      return {
        ...current,
        municipality,
        comparisonMunicipality:
          current.comparisonMunicipality === municipality
            ? (names.find((item) => item !== municipality) ?? '')
            : current.comparisonMunicipality,
        schoolCode: school?.code ?? current.schoolCode,
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
    setSettings((current) => {
      let year = current.year;
      let school = getSchools(year).find((item) => item.code === schoolCode);
      if (!school) {
        year =
          AVAILABLE_YEARS.find((candidate) =>
            getSchools(candidate).some((item) => item.code === schoolCode),
          ) ?? current.year;
        school = getSchools(year).find((item) => item.code === schoolCode);
      }
      if (!school) return current;
      return {
        ...current,
        analysisLevel: 'school',
        year,
        state: school.state,
        municipality: school.municipality,
        schoolCode: school.code,
      };
    });
  }, []);

  const value: AtlasContextValue = {
    ...settings,
    years: AVAILABLE_YEARS,
    saebYears: SAEB_AVAILABLE_YEARS,
    states,
    municipalities,
    schoolMunicipalities,
    schools,
    schoolContext,
    setAnalysisLevel,
    setYear,
    setSaebYear,
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
