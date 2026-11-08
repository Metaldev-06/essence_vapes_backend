import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

import { ThreadPriority } from '../enums/thread-priority.enum';
import { ThreadStatus } from '../enums/thread-status.enum';

export class UpdateThreadStateDto {
  @IsOptional()
  @IsEnum(ThreadStatus)
  status?: ThreadStatus;

  @IsOptional()
  @IsEnum(ThreadPriority)
  priority?: ThreadPriority;

  @IsOptional()
  @IsBoolean()
  starred?: boolean;

  /** `null` para desasignar. Validado contra un admin real en el service (nunca se confía en
   *  que el id mandado desde el cliente exista/sea admin). */
  @IsOptional()
  @IsString()
  assignedAdminId?: string | null;
}
