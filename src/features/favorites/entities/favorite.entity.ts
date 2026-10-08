import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * Plain join row between a user and a product they favorited - no ORM relations, matching the
 * rest of this codebase's TypeORM style (Product/User also use plain columns, no @ManyToOne).
 */
@Entity({ name: 'favorites' })
@Unique(['userId', 'productId'])
export class Favorite {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar' })
  productId!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
