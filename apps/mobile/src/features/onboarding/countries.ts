export interface Country {
  code: string;
  name: string;
  flag: string;
  callingCode: string;
  nationalNumberLengths: readonly number[];
}

export const countries: Country[] = [
  { code: 'MC', name: 'Monaco', flag: '🇲🇨', callingCode: '+377', nationalNumberLengths: [8] },
  { code: 'FR', name: 'France', flag: '🇫🇷', callingCode: '+33', nationalNumberLengths: [9] },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', callingCode: '+44', nationalNumberLengths: [9, 10] },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', callingCode: '+39', nationalNumberLengths: [6, 7, 8, 9, 10, 11] },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', callingCode: '+34', nationalNumberLengths: [9] },
  { code: 'US', name: 'United States', flag: '🇺🇸', callingCode: '+1', nationalNumberLengths: [10] },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', callingCode: '+49', nationalNumberLengths: [5, 6, 7, 8, 9, 10, 11] },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭', callingCode: '+41', nationalNumberLengths: [9] },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', callingCode: '+971', nationalNumberLengths: [9] },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', callingCode: '+351', nationalNumberLengths: [9] },
];
