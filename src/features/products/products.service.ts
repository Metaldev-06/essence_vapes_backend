import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';

import { In, Repository } from 'typeorm';

import { CloudinaryService } from '../../common/services/cloudinary/cloudinary.service';
import { HandleDBExceptions } from '../../common/helpers/handleDBExeption.helper';
import {
  MAX_IMAGES_PER_PRODUCT,
  MAX_VIDEOS_PER_PRODUCT,
} from './constants/media.constants';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ProductsQueryDto } from './dto/products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { Product } from './entities/product.entity';
import { ProductAuditLog } from './entities/product-audit-log.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { ProductCategory } from './enums/product-category.enum';
import { SaleAuthorizationStatus } from './enums/sale-authorization-status.enum';
import { parseCapacityMl, parsePuffCount } from './helpers/capacity.helper';
import { brandCategoriesFor, capacityUnitFor } from './helpers/category-group.helper';
import { matchesFileSignature } from './helpers/file-signature.helper';
import { findRestrictedVapePhrase } from './helpers/vape-restricted-phrases.helper';
import { slugify } from './helpers/slugify.helper';
import {
  BASE_VARIANT_ID,
  flattenProductVariant,
  ProductCardResponse,
  ProductResponse,
  toAdminProductResponse,
  toProductCardResponse,
  toProductResponse,
} from './mappers/product-response.mapper';

/** Mismo shape que `AdminActor` de `features/orders`/`features/messages` - quién hizo la acción
 *  administrativa. Definido local acá para no crear una dependencia cruzada entre features. */
export interface ProductAdminActor {
  readonly id: string;
  readonly email: string;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly productVariantsRepository: Repository<ProductVariant>,
    @InjectRepository(ProductAuditLog)
    private readonly auditLogsRepository: Repository<ProductAuditLog>,
    @InjectRepository(StockMovement)
    private readonly stockMovementsRepository: Repository<StockMovement>,
    private readonly cloudinaryService: CloudinaryService,
    private readonly configService: ConfigService,
  ) {}

  /** Public catalog - one row PER VARIANT, so a product with 3 variants shows as 3 cards. */
  async findAll(query: ProductsQueryDto) {
    return this.queryProductsExploded(query, { activeOnly: true });
  }

  /** Same filters as the public catalog, but also returns inactive products - admin only. */
  async findAllForAdmin(query: ProductsQueryDto) {
    return this.queryProductsFlat(query, { activeOnly: false });
  }

  private async queryProductsFlat(
    query: ProductsQueryDto,
    options: { activeOnly: boolean },
  ) {
    const {
      limit = 12,
      offset = 0,
      order = 'asc',
      sort = 'createdAt',
      term,
      category,
      brand,
      gender,
      accent,
      styles,
      featured,
      minPrice,
      maxPrice,
      minStock,
      maxStock,
      isActive,
    } = query;

    try {
      const qb = this.buildFilteredQuery(options);

      if (term) this.applyTermFilter(qb, term);
      if (category) qb.andWhere('product.category = :category', { category });
      if (brand) qb.andWhere('LOWER(product.brand) = LOWER(:brand)', { brand });
      if (gender) qb.andWhere('product.gender = :gender', { gender });
      if (accent) qb.andWhere('product.accent = :accent', { accent });
      if (featured !== undefined)
        qb.andWhere('product.featured = :featured', { featured });
      if (minPrice !== undefined)
        qb.andWhere('product.priceValue >= :minPrice', { minPrice });
      if (maxPrice !== undefined)
        qb.andWhere('product.priceValue <= :maxPrice', { maxPrice });
      if (minStock !== undefined) qb.andWhere('product.stock >= :minStock', { minStock });
      if (maxStock !== undefined) qb.andWhere('product.stock <= :maxStock', { maxStock });
      if (isActive !== undefined) qb.andWhere('product.isActive = :isActive', { isActive });
      if (styles && styles.length > 0) this.applyStylesFilter(qb, styles);

      qb.orderBy(`product.${sort}`, order.toUpperCase() as 'ASC' | 'DESC')
        .skip(offset)
        .take(limit);

      const [items, total] = await qb.getManyAndCount();

      return {
        data: items.map((item) => toProductResponse(item)),
        pagination: {
          total,
          pages: Math.ceil(total / limit),
          current: Math.floor(offset / limit) + 1,
          limit,
          offset,
        },
      };
    } catch (error) {
      HandleDBExceptions(error, 'ProductsService.queryProductsFlat');
    }
  }

  private async queryProductsExploded(
    query: ProductsQueryDto,
    options: { activeOnly: boolean },
  ) {
    const {
      limit = 12,
      offset = 0,
      order = 'asc',
      sort = 'createdAt',
      term,
      category,
      brand,
      gender,
      accent,
      styles,
      featured,
      minPrice,
      maxPrice,
      capacityMl,
    } = query;

    try {
      const qb = this.buildFilteredQuery(options);

      if (term) this.applyTermFilter(qb, term);
      if (category) qb.andWhere('product.category = :category', { category });
      if (brand) qb.andWhere('LOWER(product.brand) = LOWER(:brand)', { brand });
      if (gender) qb.andWhere('product.gender = :gender', { gender });
      if (accent) qb.andWhere('product.accent = :accent', { accent });
      if (featured !== undefined)
        qb.andWhere('product.featured = :featured', { featured });
      if (styles && styles.length > 0) this.applyStylesFilter(qb, styles);
      // minPrice/maxPrice/capacityMl are deferred to the row level below, since price and label
      // (capacity) now live per-variant - a product can have rows both inside and outside range.

      const products = await qb.getMany();
      const variantsByProductId = await this.loadVariantsByProductId(
        products.map((product) => product.id),
      );
      let rows = this.explodeProductsLean(products, variantsByProductId);

      if (minPrice !== undefined)
        rows = rows.filter((row) => row.priceValue >= minPrice);
      if (maxPrice !== undefined)
        rows = rows.filter((row) => row.priceValue <= maxPrice);
      if (capacityMl && capacityMl.length > 0) {
        const wanted = new Set(capacityMl);
        rows = rows.filter((row) => {
          const capacity = parseCapacityMl(row.variantLabel);
          return capacity !== null && wanted.has(capacity);
        });
      }

      rows = this.sortRows(rows, sort, order);

      const total = rows.length;
      const data = rows.slice(offset, offset + limit);

      return {
        data,
        pagination: {
          total,
          pages: Math.ceil(total / limit),
          current: Math.floor(offset / limit) + 1,
          limit,
          offset,
        },
      };
    } catch (error) {
      HandleDBExceptions(error, 'ProductsService.queryProductsExploded');
    }
  }

  private buildFilteredQuery(options: { activeOnly: boolean }) {
    const qb = this.productsRepository.createQueryBuilder('product');
    if (options.activeOnly) {
      qb.where('product.isActive = :isActive', { isActive: true });
    } else {
      // No WHERE clause to AND the rest against - this always-true base keeps the same
      // `.andWhere(...)` chain below working whether or not the active filter is applied.
      qb.where('1 = 1');
    }

    // Solo se aplica al catálogo público (activeOnly=true) - el admin siempre ve todo para
    // poder revisar/autorizar. Apagado por defecto (ver legal.config.ts): no cambia qué se
    // muestra hoy a menos que el titular active VAPES_SALE_ENFORCEMENT_ENABLED.
    if (options.activeOnly && this.isVapesSaleEnforcementEnabled()) {
      qb.andWhere(
        '(product.category != :vapesCategory OR product.saleAuthorizationStatus = :authorized)',
        {
          vapesCategory: ProductCategory.VAPES,
          authorized: SaleAuthorizationStatus.AUTORIZADO,
        },
      );
    }

    return qb;
  }

  /**
   * El `FileTypeValidator` de Nest (en el controller) solo mira el `Content-Type` que declara
   * el cliente - esto chequea el contenido real (magic number) antes de subir nada a
   * Cloudinary. No confía en la extensión ni en el mimetype declarado.
   */
  private assertRealFileSignatures(files: Express.Multer.File[]): void {
    const invalid = files.find((file) => !matchesFileSignature(file.buffer, file.mimetype));
    if (invalid) {
      throw new BadRequestException(
        `El archivo "${invalid.originalname}" no es un archivo válido de ese tipo (el contenido no coincide con lo declarado).`,
      );
    }
  }

  private isVapesSaleEnforcementEnabled(): boolean {
    return this.configService.get<boolean>('legal.vapesSaleEnforcementEnabled') ?? false;
  }

  /**
   * Guardrail real (no decorativo) contra afirmaciones prohibidas en productos "vapes"
   * (Ley 26.687): bloquea el guardado, no solo advierte en el front - ver
   * `vape-restricted-phrases.helper.ts`.
   */
  private assertVapeContentAllowed(
    category: ProductCategory,
    name?: string,
    subtitle?: string,
    notes?: string[],
  ): void {
    if (category !== ProductCategory.VAPES) return;

    const restricted = findRestrictedVapePhrase(name, subtitle, notes);
    if (restricted) {
      throw new BadRequestException(
        `No se puede guardar: el texto contiene la frase restringida "${restricted}" para ` +
          'productos de categoría vapes (Ley 26.687). Revisá nombre, subtítulo y notas.',
      );
    }
  }

  private applyTermFilter(
    qb: ReturnType<Repository<Product>['createQueryBuilder']>,
    term: string,
  ): void {
    qb.andWhere(
      '(LOWER(product.name) LIKE :term OR LOWER(product.brand) LIKE :term)',
      { term: `%${term.toLowerCase()}%` },
    );
  }

  /** AND, no OR - un producto solo matchea si tiene TODOS los estilos seleccionados, no alguno. */
  private applyStylesFilter(
    qb: ReturnType<Repository<Product>['createQueryBuilder']>,
    styles: string[],
  ): void {
    qb.andWhere(
      new Array(styles.length)
        .fill(null)
        .map((_, i) => `product.styles LIKE :style${i}`)
        .join(' AND '),
      Object.fromEntries(styles.map((style, i) => [`style${i}`, `%${style}%`])),
    );
  }

  private sortRows<T extends ProductResponse | ProductCardResponse>(
    rows: T[],
    sort: string,
    order: 'asc' | 'desc',
  ): T[] {
    const dir = order === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sort];
      const bv = (b as Record<string, unknown>)[sort];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
  }

  private async loadVariantsByProductId(
    productIds: string[],
  ): Promise<Map<string, ProductVariant[]>> {
    const map = new Map<string, ProductVariant[]>();
    if (productIds.length === 0) return map;

    const variantRows = await this.productVariantsRepository.find({
      where: { productId: In(productIds) },
    });
    for (const variant of variantRows) {
      const list = map.get(variant.productId) ?? [];
      list.push(variant);
      map.set(variant.productId, list);
    }
    return map;
  }

  private explodeProducts(
    products: Product[],
    variantsByProductId: Map<string, ProductVariant[]>,
  ): ProductResponse[] {
    return products.flatMap((product) => {
      const variants = variantsByProductId.get(product.id) ?? [];
      const variantIds = toProductResponse(product, variants).variants.map(
        (variant) => variant.id,
      );
      return variantIds.map((variantId) =>
        flattenProductVariant(product, variants, variantId),
      );
    });
  }

  /**
   * Misma explosión "una fila por variante" que `explodeProducts`, pero con la respuesta liviana
   * (`toProductCardResponse`) en vez del perfil completo - el catálogo público (`findAll`, lo que
   * `ProductCard` renderiza) no lee fragranceNotes/accords/mood/regulatorios/`variants[]`, exacto
   * mismo razonamiento que ya se aplicó a `findFeatured` (ver auditoría de performance,
   * 2026-11-11 - Hallazgo #1 de `04-backend-performance.md`). `findAllForAdmin` sigue su propio
   * camino (`queryProductsFlat`) y no se toca - el admin sí necesita el perfil completo.
   */
  private explodeProductsLean(
    products: Product[],
    variantsByProductId: Map<string, ProductVariant[]>,
  ): ProductCardResponse[] {
    return products.flatMap((product) => {
      const variants = (variantsByProductId.get(product.id) ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder);
      return [
        toProductCardResponse(product),
        ...variants.map((variant) => toProductCardResponse(product, variant)),
      ];
    });
  }

  /**
   * "Featured" now lives per-row (base product OR individual variant), not only on the product -
   * marking a product doesn't drag every one of its variants along. Only 2 queries: the featured
   * variant rows themselves (never ALL of a product's variants - a card never shows the other,
   * non-featured sizes), then the matching products. Response uses `toProductCardResponse` (see
   * its docblock) - the card never needs the fragrance/regulatory profile or `variants[]`, so
   * neither is fetched nor sent here, unlike the full catalog's `findAll`/`findOne`.
   */
  async findFeatured(): Promise<ProductCardResponse[]> {
    const featuredVariants = await this.productVariantsRepository
      .createQueryBuilder('variant')
      .select([
        'variant.id',
        'variant.productId',
        'variant.label',
        'variant.priceValue',
        'variant.stock',
        'variant.images',
        'variant.featured',
      ])
      .where('variant.featured = :featured', { featured: true })
      .getMany();

    const featuredVariantsByProductId = new Map<string, ProductVariant[]>();
    for (const variant of featuredVariants) {
      const list = featuredVariantsByProductId.get(variant.productId) ?? [];
      list.push(variant);
      featuredVariantsByProductId.set(variant.productId, list);
    }
    const featuredVariantProductIds = [...featuredVariantsByProductId.keys()];

    const qb = this.productsRepository
      .createQueryBuilder('product')
      .select([
        'product.id',
        'product.brand',
        'product.name',
        'product.variantLabel',
        'product.priceValue',
        'product.oldPriceValue',
        'product.accent',
        'product.category',
        'product.gender',
        'product.images',
        'product.stock',
        'product.isActive',
        'product.featured',
        'product.saleAuthorizationStatus',
        'product.requiresAgeVerification',
        'product.createdAt',
      ])
      .where('product.isActive = :isActive', { isActive: true })
      .andWhere(
        featuredVariantProductIds.length > 0
          ? '(product.featured = :featured OR product.id IN (:...featuredVariantProductIds))'
          : 'product.featured = :featured',
        { featured: true, featuredVariantProductIds },
      )
      .orderBy('product.createdAt', 'DESC');

    let items = await qb.getMany();

    if (this.isVapesSaleEnforcementEnabled()) {
      items = items.filter(
        (item) =>
          item.category !== ProductCategory.VAPES ||
          item.saleAuthorizationStatus === SaleAuthorizationStatus.AUTORIZADO,
      );
    }

    return items.flatMap((product) => {
      const rows: ProductCardResponse[] = [];
      if (product.featured) rows.push(toProductCardResponse(product));
      for (const variant of featuredVariantsByProductId.get(product.id) ?? []) {
        rows.push(toProductCardResponse(product, variant));
      }
      return rows;
    });
  }

  /**
   * Distinct capacities available right now across the active catalog (base products' own
   * `variantLabel` plus every `ProductVariant.label`), sorted ascending - lets the storefront
   * filter chips list exactly what's actually in stock-shape, instead of a hardcoded list.
   *
   * Sin `category`, mantiene el comportamiento histórico (ml en todo el catálogo activo - los
   * vapes, que no tienen etiquetas "Xml", simplemente no aportan nada). Con `category`, se acota
   * a esa categoría puntual (nunca mezcla ml de perfumes con ml de decants, por ejemplo - cada
   * categoría tiene su propio rango de tamaños real) y usa la unidad que corresponda (ml o
   * puffs, ver `capacityUnitFor`).
   */
  async findCapacities(category?: ProductCategory): Promise<number[]> {
    const products = await this.productsRepository.find({
      where: category ? { isActive: true, category } : { isActive: true },
      select: { id: true, variantLabel: true },
    });
    const variants = await this.productVariantsRepository.find({
      where: { productId: In(products.map((product) => product.id)) },
      select: { label: true },
    });

    const labels = [
      ...products.map((product) => product.variantLabel),
      ...variants.map((variant) => variant.label),
    ];
    const parse = category && capacityUnitFor(category) === 'puffs' ? parsePuffCount : parseCapacityMl;
    const capacities = new Set<number>();
    for (const label of labels) {
      const capacity = parse(label);
      if (capacity !== null) capacities.add(capacity);
    }

    return [...capacities].sort((a, b) => a - b);
  }

  /**
   * Distinct brand names across the active catalog, sorted alphabetically, for the storefront's
   * brand filter. Sin `category`, el universo completo (comportamiento histórico); con
   * `category`, acotado a las marcas que realmente existen ahí - perfumes y decants comparten
   * universo de marcas, vapes y esencias tienen cada uno el suyo (ver `brandCategoriesFor`).
   */
  async findBrands(category?: ProductCategory): Promise<string[]> {
    const products = await this.productsRepository.find({
      where: category ? { isActive: true, category: In(brandCategoriesFor(category)) } : { isActive: true },
      select: { brand: true },
    });
    const brands = new Set(products.map((product) => product.brand));
    return [...brands].sort((a, b) => a.localeCompare(b, 'es'));
  }

  /** Minimal, public stock snapshot for a batch of "productId" or "productId::variantId" pairs. */
  async getStock(pairs: string[]) {
    if (pairs.length === 0) return [];

    const parsed = pairs.map((pair) => {
      const [productId, variantId = BASE_VARIANT_ID] = pair.split('::');
      return { productId, variantId };
    });

    const productIds = [...new Set(parsed.map((pair) => pair.productId))];
    const products = await this.productsRepository.find({
      where: { id: In(productIds) },
      select: { id: true, stock: true, isActive: true },
    });
    const productById = new Map(products.map((product) => [product.id, product]));

    const variantIds = parsed
      .filter((pair) => pair.variantId !== BASE_VARIANT_ID)
      .map((pair) => pair.variantId);
    const variantRows =
      variantIds.length > 0
        ? await this.productVariantsRepository.find({
            where: { id: In(variantIds), productId: In(productIds) },
          })
        : [];
    const variantById = new Map(variantRows.map((variant) => [variant.id, variant]));

    return parsed
      .map(({ productId, variantId }) => {
        const product = productById.get(productId);
        if (!product) return null;

        const stock =
          variantId === BASE_VARIANT_ID
            ? product.stock
            : variantById.get(variantId)?.stock;
        if (stock === undefined) return null;

        return { id: productId, variantId, stock, isActive: product.isActive };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }

  async findOne(id: string) {
    const product = await this.findEntityOrFail(id);
    const variants = await this.findVariantsForProduct(id);
    return toProductResponse(product, variants);
  }

  /** Mismo producto que `findOne`, pero con el costo de adquisición incluido (ver
   *  `toAdminProductResponse`) - solo para la ruta admin, nunca para la pública. */
  async findOneForAdmin(id: string) {
    const product = await this.findEntityOrFail(id);
    const variants = await this.findVariantsForProduct(id);
    return toAdminProductResponse(product, variants);
  }

  async create(dto: CreateProductDto) {
    this.assertVapeContentAllowed(dto.category, dto.name, dto.subtitle, dto.notes);

    try {
      const id = dto.id
        ? slugify(dto.id)
        : await this.generateUniqueSlug(`${dto.brand}-${dto.name}`);
      const product = this.productsRepository.create({
        ...dto,
        id,
        requiresAgeVerification: dto.category === ProductCategory.VAPES,
      });
      const saved = await this.productsRepository.save(product);
      return toProductResponse(saved);
    } catch (error) {
      HandleDBExceptions(error, 'ProductsService.create');
    }
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.findEntityOrFail(id);
    const category = dto.category ?? product.category;
    this.assertVapeContentAllowed(
      category,
      dto.name ?? product.name,
      dto.subtitle ?? product.subtitle,
      dto.notes ?? product.notes,
    );

    try {
      Object.assign(product, dto);
      product.requiresAgeVerification = category === ProductCategory.VAPES;
      const saved = await this.productsRepository.save(product);
      const variants = await this.findVariantsForProduct(id);
      return toProductResponse(saved, variants);
    } catch (error) {
      HandleDBExceptions(error, 'ProductsService.update');
    }
  }

  async remove(id: string): Promise<void> {
    const product = await this.findEntityOrFail(id);
    const variants = await this.findVariantsForProduct(id);

    await Promise.all([
      ...(product.images ?? []).map((image) =>
        this.cloudinaryService.destroy(image.publicId, 'image'),
      ),
      ...(product.videos ?? []).map((video) =>
        this.cloudinaryService.destroy(video.publicId, 'video'),
      ),
      ...variants.flatMap((variant) =>
        (variant.images ?? []).map((image) =>
          this.cloudinaryService.destroy(image.publicId, 'image'),
        ),
      ),
    ]);

    if (variants.length > 0) {
      await this.productVariantsRepository.delete({ productId: id });
    }
    await this.productsRepository.delete(id);
  }

  /**
   * Acciones masivas (ver tarea, punto 5.2) - un solo UPDATE por campo (no uno por producto), y
   * una entrada de auditoría POR producto afectado para poder rastrear después qué cambió y
   * quién lo hizo (mismo patrón que `OrderAuditLog`). `changes` solo trae los campos que el admin
   * realmente quiso tocar - nunca pisa algo que no vino en el pedido.
   */
  async bulkUpdate(
    ids: string[],
    changes: { isActive?: boolean; featured?: boolean; category?: ProductCategory },
    actor: ProductAdminActor,
  ): Promise<{ updated: number }> {
    if (ids.length === 0) return { updated: 0 };
    if (Object.keys(changes).length === 0) return { updated: 0 };

    if (changes.category) {
      // Reutiliza la misma validación regulatoria que ya aplica `update()` - cambiar de categoría
      // en masa no debe poder saltarse las restricciones de "vapes" (Ley 26.687).
      const targets = await this.productsRepository.find({ where: { id: In(ids) } });
      for (const target of targets) {
        this.assertVapeContentAllowed(changes.category, target.name, target.subtitle, target.notes);
      }
    }

    const result = await this.productsRepository
      .createQueryBuilder()
      .update(Product)
      .set(changes)
      .where('id IN (:...ids)', { ids })
      .execute();

    const detailParts: string[] = [];
    if (changes.isActive !== undefined) detailParts.push(changes.isActive ? 'publicado' : 'ocultado');
    if (changes.featured !== undefined) {
      detailParts.push(changes.featured ? 'marcado como destacado' : 'quitado de destacados');
    }
    if (changes.category) detailParts.push(`categoría -> ${changes.category}`);
    const detail = `Acción masiva: ${detailParts.join(', ')}`;

    await this.auditLogsRepository.save(
      ids.map((productId) =>
        this.auditLogsRepository.create({
          adminId: actor.id,
          adminEmail: actor.email,
          action: 'bulk_update',
          productId,
          detail,
        }),
      ),
    );

    return { updated: result.affected ?? 0 };
  }

  /**
   * Ajuste manual de stock con motivo obligatorio (ver tarea, punto 5.3) - UPDATE atómico
   * condicionado por el propio WHERE (`stock + :change >= 0`, mismo criterio que la reserva de
   * stock del checkout en `OrdersService.createFromCart`), para que un ajuste negativo nunca deje
   * el stock por debajo de 0 aunque dos ajustes lleguen a la vez.
   */
  async adjustStock(
    productId: string,
    variantId: string,
    quantityChange: number,
    reason: string,
    actor: ProductAdminActor,
  ): Promise<{ stockAfter: number }> {
    if (quantityChange === 0) throw new BadRequestException('El ajuste no puede ser 0');

    const isBase = variantId === BASE_VARIANT_ID;
    const entity = isBase ? Product : ProductVariant;
    const where = isBase
      ? { id: productId }
      : { id: variantId, productId };

    const result = await this.productsRepository.manager
      .createQueryBuilder()
      .update(entity)
      .set({ stock: () => 'stock + :change' })
      .where(
        Object.keys(where)
          .map((key) => `${key} = :${key}`)
          .join(' AND ') + ' AND stock + :change >= 0',
        { ...where, change: quantityChange },
      )
      .execute();

    if (!result.affected) {
      throw new BadRequestException('El ajuste dejaría el stock en negativo, o no se encontró el producto/variante');
    }

    const updated = isBase
      ? await this.productsRepository.findOne({ where: { id: productId } })
      : await this.productVariantsRepository.findOne({ where: { id: variantId, productId } });
    const stockAfter = updated?.stock ?? 0;

    await this.stockMovementsRepository.save(
      this.stockMovementsRepository.create({
        productId,
        variantId,
        quantityChange,
        stockAfter,
        reason,
        adminId: actor.id,
        adminEmail: actor.email,
      }),
    );

    return { stockAfter };
  }

  async getStockMovements(productId: string): Promise<StockMovement[]> {
    return this.stockMovementsRepository.find({
      where: { productId },
      order: { createdAt: 'DESC' },
    });
  }

  async addImages(id: string, files: Express.Multer.File[]) {
    const product = await this.findEntityOrFail(id);
    const currentImages = product.images ?? [];
    this.assertRealFileSignatures(files);

    if (currentImages.length + files.length > MAX_IMAGES_PER_PRODUCT) {
      throw new BadRequestException(
        `Un producto puede tener como máximo ${MAX_IMAGES_PER_PRODUCT} imágenes`,
      );
    }

    const uploaded = await Promise.all(
      files.map((file) =>
        this.cloudinaryService.uploadImage(
          file,
          `essence-vapes/products/${product.id}`,
        ),
      ),
    );

    product.images = [...currentImages, ...uploaded];
    const saved = await this.productsRepository.save(product);
    const variants = await this.findVariantsForProduct(id);
    return toProductResponse(saved, variants);
  }

  async removeImage(id: string, publicId: string) {
    const product = await this.findEntityOrFail(id);
    const currentImages = product.images ?? [];

    if (!currentImages.some((image) => image.publicId === publicId)) {
      throw new NotFoundException(
        `No se encontró la imagen "${publicId}" en este producto`,
      );
    }

    await this.cloudinaryService.destroy(publicId, 'image');
    product.images = currentImages.filter(
      (image) => image.publicId !== publicId,
    );
    const saved = await this.productsRepository.save(product);
    const variants = await this.findVariantsForProduct(id);
    return toProductResponse(saved, variants);
  }

  async addVideos(id: string, files: Express.Multer.File[]) {
    const product = await this.findEntityOrFail(id);
    const currentVideos = product.videos ?? [];
    this.assertRealFileSignatures(files);

    if (currentVideos.length + files.length > MAX_VIDEOS_PER_PRODUCT) {
      throw new BadRequestException(
        `Un producto puede tener como máximo ${MAX_VIDEOS_PER_PRODUCT} videos`,
      );
    }

    const uploaded = await Promise.all(
      files.map((file) =>
        this.cloudinaryService.uploadVideo(
          file,
          `essence-vapes/products/${product.id}`,
        ),
      ),
    );

    product.videos = [...currentVideos, ...uploaded];
    const saved = await this.productsRepository.save(product);
    const variants = await this.findVariantsForProduct(id);
    return toProductResponse(saved, variants);
  }

  async removeVideo(id: string, publicId: string) {
    const product = await this.findEntityOrFail(id);
    const currentVideos = product.videos ?? [];

    if (!currentVideos.some((video) => video.publicId === publicId)) {
      throw new NotFoundException(
        `No se encontró el video "${publicId}" en este producto`,
      );
    }

    await this.cloudinaryService.destroy(publicId, 'video');
    product.videos = currentVideos.filter(
      (video) => video.publicId !== publicId,
    );
    const saved = await this.productsRepository.save(product);
    const variants = await this.findVariantsForProduct(id);
    return toProductResponse(saved, variants);
  }

  async addVariant(productId: string, dto: CreateVariantDto) {
    await this.findEntityOrFail(productId);

    try {
      const variant = this.productVariantsRepository.create({
        label: dto.label,
        priceValue: dto.priceValue,
        costValue: dto.costValue ?? null,
        stock: dto.stock ?? 0,
        sortOrder: dto.sortOrder ?? 0,
        featured: dto.featured ?? false,
        productId,
      });
      await this.productVariantsRepository.save(variant);
      return this.findOne(productId);
    } catch (error) {
      HandleDBExceptions(error, 'ProductsService.addVariant');
    }
  }

  async updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ) {
    const variant = await this.findVariantOrFail(productId, variantId);

    try {
      Object.assign(variant, dto);
      await this.productVariantsRepository.save(variant);
      return this.findOne(productId);
    } catch (error) {
      HandleDBExceptions(error, 'ProductsService.updateVariant');
    }
  }

  async removeVariant(productId: string, variantId: string) {
    const variant = await this.findVariantOrFail(productId, variantId);

    await Promise.all(
      (variant.images ?? []).map((image) =>
        this.cloudinaryService.destroy(image.publicId, 'image'),
      ),
    );
    await this.productVariantsRepository.delete(variant.id);
    return this.findOne(productId);
  }

  async addVariantImages(
    productId: string,
    variantId: string,
    files: Express.Multer.File[],
  ) {
    const variant = await this.findVariantOrFail(productId, variantId);
    const currentImages = variant.images ?? [];
    this.assertRealFileSignatures(files);

    if (currentImages.length + files.length > MAX_IMAGES_PER_PRODUCT) {
      throw new BadRequestException(
        `Una variante puede tener como máximo ${MAX_IMAGES_PER_PRODUCT} imágenes`,
      );
    }

    const uploaded = await Promise.all(
      files.map((file) =>
        this.cloudinaryService.uploadImage(
          file,
          `essence-vapes/products/${productId}/variants/${variant.id}`,
        ),
      ),
    );

    variant.images = [...currentImages, ...uploaded];
    await this.productVariantsRepository.save(variant);
    return this.findOne(productId);
  }

  async removeVariantImage(
    productId: string,
    variantId: string,
    publicId: string,
  ) {
    const variant = await this.findVariantOrFail(productId, variantId);
    const currentImages = variant.images ?? [];

    if (!currentImages.some((image) => image.publicId === publicId)) {
      throw new NotFoundException(
        `No se encontró la imagen "${publicId}" en esta variante`,
      );
    }

    await this.cloudinaryService.destroy(publicId, 'image');
    variant.images = currentImages.filter(
      (image) => image.publicId !== publicId,
    );
    await this.productVariantsRepository.save(variant);
    return this.findOne(productId);
  }

  private async findVariantsForProduct(
    productId: string,
  ): Promise<ProductVariant[]> {
    return this.productVariantsRepository.find({
      where: { productId },
      order: { sortOrder: 'ASC' },
    });
  }

  private async findVariantOrFail(
    productId: string,
    variantId: string,
  ): Promise<ProductVariant> {
    const variant = await this.productVariantsRepository.findOne({
      where: { id: variantId, productId },
    });
    if (!variant)
      throw new NotFoundException(
        `No se encontró la variante con id "${variantId}" en este producto`,
      );
    return variant;
  }

  private async findEntityOrFail(id: string): Promise<Product> {
    const product = await this.productsRepository.findOne({ where: { id } });
    if (!product)
      throw new NotFoundException(`No se encontró el producto con id "${id}"`);
    return product;
  }

  private async generateUniqueSlug(base: string): Promise<string> {
    const baseSlug = slugify(base);
    let candidate = baseSlug;
    let suffix = 2;

    while (await this.productsRepository.exists({ where: { id: candidate } })) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }
}
