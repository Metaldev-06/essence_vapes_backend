import { IsIn } from 'class-validator';

const MOVE_FOLDERS = ['inbox', 'archive', 'spam', 'trash'] as const;
export type MoveFolderValue = (typeof MOVE_FOLDERS)[number];

export class UpdateThreadFolderDto {
  @IsIn(MOVE_FOLDERS)
  folder!: MoveFolderValue;
}
