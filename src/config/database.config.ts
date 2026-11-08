import { registerAs } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Sin DATABASE_URL seteada: SQLite local de siempre (un solo archivo, sin servidor aparte) - el
 * caso normal para desarrollo. Con DATABASE_URL (postgresql://...): Postgres - producción en el
 * VPS (Dokploy), o localmente apuntando a esa misma base de producción para debug, sin tocar
 * código. `synchronize: true` + `autoLoadEntities: true` en ambos casos, mismo criterio que el
 * resto del proyecto (sin migraciones formales - cada entidad/columna nueva es aditiva).
 */
export default registerAs('database', (): TypeOrmModuleOptions => {
  const url = process.env.DATABASE_URL;

  if (url) {
    return {
      type: 'postgres',
      url,
      ssl: process.env.DATABASE_SSL === 'true',
      synchronize: true,
      autoLoadEntities: true,
    };
  }

  return {
    type: 'better-sqlite3',
    database: 'essence-vapes.sqlite',
    synchronize: true,
    autoLoadEntities: true,
  };
});
