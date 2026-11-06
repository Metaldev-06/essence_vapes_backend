import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';

interface RequestWithId {
  id?: string;
}

interface ResponseLike {
  setHeader: (name: string, value: string) => void;
}

/** Un id por request (`request.id` + header `X-Request-Id`) para correlacionar logs y eventos de seguridad. */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: ResponseLike, next: () => void): void {
    req.id = randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  }
}
