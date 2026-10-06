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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  @Post(':id/images')
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
        .addFileTypeValidator({ fileType: IMAGE_MIME_TYPES })
        .addMaxSizeValidator({ maxSize: MAX_IMAGE_SIZE_BYTES })
        .build({ fileIsRequired: true }),
    )
    files: Express.Multer.File[],
  ) {
    return this.productsService.addImages(id, files);
  }

  @Delete(':id/images')
  removeImage(@Param('id') id: string, @Query('publicId') publicId?: string) {
    if (!publicId)
      throw new BadRequestException('publicId query param is required');
    return this.productsService.removeImage(id, publicId);
  }

  @Post(':id/videos')
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
        .addFileTypeValidator({ fileType: VIDEO_MIME_TYPES })
        .addMaxSizeValidator({ maxSize: MAX_VIDEO_SIZE_BYTES })
        .build({ fileIsRequired: true }),
    )
    files: Express.Multer.File[],
  ) {
    return this.productsService.addVideos(id, files);
  }

  @Delete(':id/videos')
  removeVideo(@Param('id') id: string, @Query('publicId') publicId?: string) {
    if (!publicId)
      throw new BadRequestException('publicId query param is required');
    return this.productsService.removeVideo(id, publicId);
  }
}
