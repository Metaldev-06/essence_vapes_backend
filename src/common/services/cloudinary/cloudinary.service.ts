import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  v2 as cloudinarySdk,
  UploadApiErrorResponse,
  UploadApiResponse,
} from 'cloudinary';
import * as streamifier from 'streamifier';

import { CLOUDINARY } from './cloudinary.provider';

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
}

export type CloudinaryResourceType = 'image' | 'video';

@Injectable()
export class CloudinaryService {
  constructor(
    @Inject(CLOUDINARY) private readonly cloudinary: typeof cloudinarySdk,
  ) {}

  uploadImage(
    file: Express.Multer.File,
    folder: string,
  ): Promise<CloudinaryUploadResult> {
    return this.upload(file, folder, 'image');
  }

  uploadVideo(
    file: Express.Multer.File,
    folder: string,
  ): Promise<CloudinaryUploadResult> {
    return this.upload(file, folder, 'video');
  }

  async destroy(
    publicId: string,
    resourceType: CloudinaryResourceType,
  ): Promise<void> {
    await this.cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
  }

  private upload(
    file: Express.Multer.File,
    folder: string,
    resourceType: CloudinaryResourceType,
  ): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        { folder, resource_type: resourceType },
        (error?: UploadApiErrorResponse, result?: UploadApiResponse) => {
          if (error || !result) {
            reject(
              new InternalServerErrorException(
                error?.message ?? 'Cloudinary upload failed',
              ),
            );
            return;
          }
          resolve({ url: result.secure_url, publicId: result.public_id });
        },
      );

      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }
}
