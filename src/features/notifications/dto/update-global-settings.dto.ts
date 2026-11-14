import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Reglas compartidas por todos los admins - rangos acotados para que un valor absurdo (0 horas,
 *  retención de 1 día) no pueda dejar el sistema alertando en loop o borrando el historial. */
export class UpdateGlobalSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  lowStockThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  pendingPreparationHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  pendingDispatchHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  unansweredHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  reorderReminderDays?: number;

  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(730)
  retentionDays?: number;
}
