import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * Plain join row between a user and a product (variant) they favorited - no ORM relations,
 * matching the rest of this codebase's TypeORM style (Product/User also use plain columns, no
 * @ManyToOne).
 */
@Entity({ name: 'favorites' })
@Unique(['userId', 'productId', 'variantId'])
export class Favorite {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar' })
  productId!: string;

  // Always a concrete value ('base' for the product's own variant) - never null, since SQLite
  // treats every NULL as distinct in a UNIQUE index and that would defeat this constraint. Lets
  // a 2ml and a 5ml of the same product be favorited independently (see CartItem, same pattern).
  @Column({ type: 'varchar', default: 'base' })
  variantId!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
