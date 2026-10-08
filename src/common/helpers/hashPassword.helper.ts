import { UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';

export const HashPassword = async (password: string, salt = 10) => {
  const hash = await bcrypt.hash(password, salt);
  return hash;
};

export const ComparePassword = async (password: string, hash: string) => {
  if (!(await bcrypt.compare(password, hash)))
    throw new UnauthorizedException('Credentials are not valid');
};
