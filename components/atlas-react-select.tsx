'use client';

import Select, { type SingleValue, type StylesConfig } from 'react-select';

export type AtlasSelectOption = {
  value: string;
  label: string;
};

const styles: StylesConfig<AtlasSelectOption, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: 46,
    borderColor: state.isFocused
      ? 'rgba(200, 236, 81, .72)'
      : 'rgba(255, 255, 255, .14)',
    borderRadius: state.menuIsOpen ? '8px 8px 0 0' : 8,
    backgroundColor: state.isFocused
      ? 'rgba(255, 255, 255, .09)'
      : 'rgba(255, 255, 255, .06)',
    boxShadow: 'none',
    cursor: 'pointer',
    transition: 'border-color 160ms ease, background-color 160ms ease',
    ':hover': {
      borderColor: 'rgba(255, 255, 255, .26)',
      backgroundColor: 'rgba(255, 255, 255, .09)',
    },
  }),
  valueContainer: (base) => ({ ...base, padding: '8px 12px' }),
  singleValue: (base) => ({
    ...base,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
  }),
  input: (base) => ({ ...base, color: '#fff', fontSize: 16 }),
  indicatorsContainer: (base) => ({ ...base, paddingRight: 4 }),
  indicatorSeparator: () => ({ display: 'none' }),
  dropdownIndicator: (base, state) => ({
    ...base,
    color: state.isFocused ? '#c8ec51' : 'rgba(255, 255, 255, .44)',
    padding: 6,
    ':hover': { color: '#c8ec51' },
  }),
  menu: (base) => ({
    ...base,
    zIndex: 60,
    marginTop: 0,
    overflow: 'hidden',
    border: '1px solid rgba(255, 255, 255, .16)',
    borderTop: 0,
    borderRadius: '0 0 8px 8px',
    backgroundColor: '#203741',
    boxShadow: '0 14px 32px rgba(7, 20, 26, .28)',
  }),
  menuList: (base) => ({
    ...base,
    padding: 0,
    scrollbarColor: 'rgba(200, 236, 81, .48) transparent',
    scrollbarWidth: 'thin',
  }),
  option: (base, state) => ({
    ...base,
    margin: 0,
    minHeight: 44,
    padding: '11px 12px',
    borderBottom: '1px solid rgba(255, 255, 255, .08)',
    borderRadius: 0,
    backgroundColor: state.isSelected
      ? 'rgba(200, 236, 81, .16)'
      : state.isFocused
        ? 'rgba(255, 255, 255, .08)'
        : 'transparent',
    color: state.isSelected ? '#dff68b' : 'rgba(255, 255, 255, .84)',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    ':active': { backgroundColor: 'rgba(200, 236, 81, .12)' },
    ':last-of-type': { borderBottom: 0 },
  }),
  noOptionsMessage: (base) => ({
    ...base,
    color: 'rgba(255, 255, 255, .56)',
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
