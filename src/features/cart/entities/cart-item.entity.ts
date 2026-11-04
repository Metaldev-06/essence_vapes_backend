import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/** Plain join row (no ORM relations, matching Product/User/Favorite in this codebase). */
@Entity({ name: 'cart_items' })
@Unique(['userId', 'productId', 'variantId'])
export class CartItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  userId!: string;

  @Column({ type: 'varchar' })
  productId!: string;

  // Always a concrete value ('base' for the product's own variant) - never null, since SQLite
  // treats every NULL as distinct in a UNIQUE index and that would defeat this constraint.
  @Column({ type: 'varchar', default: 'base' })
  variantId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
