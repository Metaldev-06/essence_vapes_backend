import { Logger } from '@nestjs/common';

export const LoggerHelper = (message: string, ctx: string, error?: boolean) => {
  const logger = new Logger(ctx);

  if (error) logger.error(message);

  logger.log(message);
};
