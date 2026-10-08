import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { Role } from '../../common/enums/system-role.enum';
import { Auth } from '../auth/decorators/auth.decorator';
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGES_PER_PRODUCT,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEOS_PER_PRODUCT,
  MAX_VIDEO_SIZE_BYTES,
  VIDEO_MIME_TYPES,
} from './constants/media.constants';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductsQueryDto } from './dto/products-query.dto';
import { StockQueryDto } from './dto/stock-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Query() query: ProductsQueryDto) {
    return this.productsService.findAll(query);
  }

  @Get('featured')
  findFeatured() {
    return this.productsService.findFeatured();
  }

  /** Same shape as the public catalog, but also includes inactive products - admin only. */
  @Get('admin/all')
  @Auth(Role.ADMIN)
  findAllForAdmin(@Query() query: ProductsQueryDto) {
    return this.productsService.findAllForAdmin(query);
  }

  /**
   * Public, lightweight stock lookup for a batch of ids - used by the cart to re-check
   * availability for guests (no backend cart to join against) without fetching full product
   * payloads. Must stay above `:id` or that route would swallow `/products/stock`.
   */
  @Get('stock')
  getStock(@Query() query: StockQueryDto) {
    return this.productsService.getStock(query.ids);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  @Auth(Role.ADMIN)
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @Auth(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @Auth(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  @Post(':id/images')
  @Auth(Role.ADMIN)
  @UseInterceptors(
    FilesInterceptor('files', MAX_IMAGES_PER_PRODUCT, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
    }),
  )
  uploadImages(
    @Param('id') id: string,
    @UploadedFiles(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: IMAGE_MIME_TYPES,
          errorMessage:
            'El archivo debe ser una imagen (jpeg, png, webp o gif)',
        })
        .addMaxSizeValidator({
          maxSize: MAX_IMAGE_SIZE_BYTES,
          errorMessage: `La imagen no puede superar los ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB`,
        })
        .build({
          fileIsRequired: true,
          exceptionFactory: (error) =>
            new BadRequestException(translateFileError(error)),
        }),
    )
    files: Express.Multer.File[],
  ) {
    return this.productsService.addImages(id, files);
  }

  @Delete(':id/images')
  @Auth(Role.ADMIN)
  removeImage(@Param('id') id: string, @Query('publicId') publicId?: string) {
    if (!publicId)
      throw new BadRequestException('El parámetro publicId es requerido');
    return this.productsService.removeImage(id, publicId);
  }

  @Post(':id/videos')
  @Auth(Role.ADMIN)
  @UseInterceptors(
    FilesInterceptor('files', MAX_VIDEOS_PER_PRODUCT, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_VIDEO_SIZE_BYTES },
    }),
  )
  uploadVideos(
    @Param('id') id: string,
    @UploadedFiles(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: VIDEO_MIME_TYPES,
          errorMessage: 'El archivo debe ser un video (mp4, webm o mov)',
        })
        .addMaxSizeValidator({
          maxSize: MAX_VIDEO_SIZE_BYTES,
          errorMessage: `El video no puede superar los ${MAX_VIDEO_SIZE_BYTES / (1024 * 1024)}MB`,
        })
        .build({
          fileIsRequired: true,
          exceptionFactory: (error) =>
            new BadRequestException(translateFileError(error)),
        }),
    )
    files: Express.Multer.File[],
  ) {
    return this.productsService.addVideos(id, files);
  }

  @Delete(':id/videos')
  @Auth(Role.ADMIN)
  removeVideo(@Param('id') id: string, @Query('publicId') publicId?: string) {
    if (!publicId)
      throw new BadRequestException('El parámetro publicId es requerido');
    return this.productsService.removeVideo(id, publicId);
  }
}

/**
 * `ParseFilePipeBuilder` only lets per-validator messages be customized (set above); the
 * "no file(s) selected" case is hardcoded in English by Nest, so it's translated here.
 */
function translateFileError(error: string): string {
  return error === 'File is required' ? 'El archivo es requerido' : error;
}
