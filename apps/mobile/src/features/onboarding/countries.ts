export interface Country {
  code: string;
  name: string;
  flag: string;
  callingCode: string;
}

export const countries: Country[] = [
  { code: 'MC', name: 'Monaco', flag: '🇲🇨', callingCode: '+377' },
  { code: 'FR', name: 'France', flag: '🇫🇷', callingCode: '+33' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', callingCode: '+44' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', callingCode: '+39' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', callingCode: '+34' },
  { code: 'US', name: 'United States', flag: '🇺🇸', callingCode: '+1' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', callingCode: '+49' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭', callingCode: '+41' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', callingCode: '+971' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', callingCode: '+351' },
];
