'use client';

import Select, { type SingleValue, type StylesConfig } from 'react-select';

export type AtlasSelectOption = {
  value: string;
  label: string;
};

const styles: StylesConfig<AtlasSelectOption, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: 42,
    borderColor: state.isFocused ? 'var(--teal)' : 'var(--line)',
    borderRadius: state.menuIsOpen ? '12px 12px 0 0' : 12,
    backgroundColor: 'var(--surface)',
    boxShadow: 'none',
    cursor: 'pointer',
    transition: 'border-color 160ms ease, background-color 160ms ease',
    ':hover': {
      borderColor: 'var(--line-strong)',
    },
  }),
  valueContainer: (base) => ({ ...base, padding: '6px 10px' }),
  singleValue: (base) => ({
    ...base,
    color: 'var(--ink)',
    fontSize: 12,
    fontWeight: 600,
  }),
  input: (base) => ({ ...base, color: 'var(--ink)', fontSize: 13 }),
  indicatorsContainer: (base) => ({ ...base, paddingRight: 4 }),
  indicatorSeparator: () => ({ display: 'none' }),
  dropdownIndicator: (base, state) => ({
    ...base,
    color: state.isFocused ? 'var(--teal)' : 'var(--muted)',
    padding: 6,
    ':hover': { color: 'var(--teal)' },
  }),
  menu: (base) => ({
    ...base,
    zIndex: 60,
    marginTop: 0,
    overflow: 'hidden',
    border: '1px solid var(--line)',
    borderTop: 0,
    borderRadius: '0 0 12px 12px',
    backgroundColor: 'var(--surface-raised)',
    boxShadow: '0 16px 34px rgba(0, 0, 0, .16)',
  }),
  menuList: (base) => ({
    ...base,
    padding: 0,
    scrollbarColor: 'var(--line-strong) transparent',
    scrollbarWidth: 'thin',
  }),
  option: (base, state) => ({
    ...base,
    margin: 0,
    minHeight: 44,
    padding: '11px 12px',
    borderBottom: '1px solid var(--line)',
    borderRadius: 0,
    backgroundColor: state.isSelected
      ? 'var(--teal-soft)'
      : state.isFocused
        ? 'var(--surface-soft)'
        : 'transparent',
    color: state.isSelected ? 'var(--teal)' : 'var(--ink)',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    ':active': { backgroundColor: 'var(--teal-soft)' },
    ':last-of-type': { borderBottom: 0 },
  }),
  noOptionsMessage: (base) => ({
    ...base,
    color: 'var(--muted)',
    fontSize: 13,
  }),
};

export function AtlasReactSelect({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string;
  options: AtlasSelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <Select<AtlasSelectOption, false>
      inputId={id}
      instanceId={id}
      value={options.find((option) => option.value === value) ?? null}
      options={options}
      onChange={(option: SingleValue<AtlasSelectOption>) =>
        option && onChange(option.value)
      }
      styles={styles}
      isSearchable={options.length > 8}
      noOptionsMessage={() => 'Nenhum resultado'}
      menuPlacement="auto"
    />
  );
}
