import { User } from '../entities/user.entity';

export const toUserResponse = (user: User) => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  phone: user.phone,
  birthDate: user.birthDate,
  role: user.role,
  isActive: user.isActive,
  emailVerified: user.emailVerified,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export type UserResponse = ReturnType<typeof toUserResponse>;
