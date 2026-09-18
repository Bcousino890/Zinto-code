import React, { useMemo, useState } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/use-translation';
import countryCodes from '@/lib/country-codes';

interface CountrySelectorProps {
  /** ISO 3166-1 alpha-2 country code, e.g. "ES". */
  value: string | null | undefined;
  onChange: (code: string) => void;
  className?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
}

/**
 * Searchable country select, built on the same Command/Popover combobox pattern as
 * TimezoneSelector. Sources its options from `@/lib/country-codes` (the repo's existing
 * country list constant) rather than a new hand-rolled list, sorted alphabetically by name
 * for easier scanning.
 */
export const CountrySelector: React.FC<CountrySelectorProps> = ({
  value,
  onChange,
  className,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  disabled,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const resolvedPlaceholder = placeholder ?? t('country_selector.select_placeholder', 'Select country...');
  const resolvedSearchPlaceholder = searchPlaceholder ?? t('country_selector.search_placeholder', 'Search countries...');
  const resolvedEmptyMessage = emptyMessage ?? t('country_selector.not_found', 'No country found.');

  const sortedCountries = useMemo(
    () => [...countryCodes].sort((a, b) => a.name.localeCompare(b.name)),
    []
  );

  const selectedCountry = sortedCountries.find((country) => country.code === value);

  const filteredCountries = useMemo(() => {
    if (!searchValue) return sortedCountries;
    const searchLower = searchValue.toLowerCase();
    return sortedCountries.filter(
      (country) =>
        country.name.toLowerCase().includes(searchLower) ||
        country.code.toLowerCase().includes(searchLower)
    );
  }, [searchValue, sortedCountries]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('justify-between font-normal', className)}
        >
          {selectedCountry ? selectedCountry.name : (value || resolvedPlaceholder)}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0">
        <Command>
          <CommandInput
            placeholder={resolvedSearchPlaceholder}
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandEmpty>{resolvedEmptyMessage}</CommandEmpty>
          <CommandList className="max-h-[300px]">
            <CommandGroup>
              {filteredCountries.map((country) => (
                <CommandItem
                  key={country.code}
                  value={country.code}
                  onSelect={(currentValue) => {
                    onChange(currentValue.toUpperCase());
                    setOpen(false);
                    setSearchValue('');
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === country.code ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {country.name}
                  <span className="ml-auto text-xs text-muted-foreground">{country.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default CountrySelector;
