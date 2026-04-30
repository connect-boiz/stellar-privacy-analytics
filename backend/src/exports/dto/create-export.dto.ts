export class CreateExportDto {
  userId: string;
  format: 'csv' | 'json' | 'parquet';
}