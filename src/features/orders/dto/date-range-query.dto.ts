import { IsDateString } from 'class-validator';

/** `from`/`to` tal como los produce `DateRangeSelection` del frontend (`fromUtc`/`toUtc`) - el
 *  período cubre `[from, to)`, `to` exclusivo. */
export class DateRangeQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
