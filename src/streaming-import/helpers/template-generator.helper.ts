import { CSV_HEADERS } from './csv-parser.helper';

export function getImportTemplate(): Buffer {
  const example = [
    'Netflix',
    'correo@ejemplo.com',
    'clave123',
    '2026-03-01',
    '30',
    '14.00',
    'Proveedor X',
    '0999999999',
    '1',
    '4.00',
    '2026-03-21',
    '30',
    'Juan Pérez',
    'VIP',
    '#22c55e',
  ];
  return Buffer.from(
    [CSV_HEADERS.join(','), example.join(',')].join('\n'),
    'utf-8',
  );
}
