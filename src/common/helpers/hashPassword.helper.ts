import bcrypt from 'bcryptjs';

export const HashPassword = async (password: string, salt = 10) => {
  const hash = await bcrypt.hash(password, salt);
  return hash;
};

/** No lanza - devuelve el resultado para que el caller decida (necesario para el chequeo de
 *  timing-safety contra un hash dummy en `AuthService.login`). */
export const ComparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};
