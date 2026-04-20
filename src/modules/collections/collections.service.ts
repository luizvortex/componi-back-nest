import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Collection } from '../../database/entities/collection.entity';
import { CollectionComponent } from '../../database/entities/collection-component.entity';
import type { AuthUser } from '../../common/types/auth-user.type';
import { CreateCollectionDto } from './dto/create-collection.dto';

@Injectable()
export class CollectionsService {
  constructor(
    @InjectRepository(Collection) private readonly collections: Repository<Collection>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  listForUser(userId: string): Promise<Collection[]> {
    return this.collections.find({
      where: { ownerId: userId },
      order: { createdAt: 'DESC' },
    });
  }

  create(user: AuthUser, dto: CreateCollectionDto): Promise<Collection> {
    const collection = this.collections.create({
      ownerId: user.id,
      name: dto.name,
      description: dto.description ?? null,
      isPublic: dto.isPublic ?? false,
    });
    return this.collections.save(collection);
  }

  async findOne(id: string, user?: AuthUser): Promise<Collection> {
    const collection = await this.collections.findOne({
      where: { id },
      relations: { items: { component: true } },
    });
    if (!collection) throw new NotFoundException('Collection not found');
    if (!collection.isPublic && collection.ownerId !== user?.id) {
      throw new NotFoundException('Collection not found');
    }
    return collection;
  }

  async addComponent(id: string, componentId: string, user: AuthUser): Promise<void> {
    await this.dataSource.transaction(async (trx) => {
      const collection = await trx.getRepository(Collection).findOne({ where: { id } });
      if (!collection) throw new NotFoundException('Collection not found');
      if (collection.ownerId !== user.id) throw new ForbiddenException();

      const existing = await trx
        .getRepository(CollectionComponent)
        .findOne({ where: { collectionId: id, componentId } });
      if (existing) return;

      await trx
        .getRepository(CollectionComponent)
        .insert({ collectionId: id, componentId });
      await trx.getRepository(Collection).increment({ id }, 'componentsCount', 1);
    });
  }

  async removeComponent(id: string, componentId: string, user: AuthUser): Promise<void> {
    await this.dataSource.transaction(async (trx) => {
      const collection = await trx.getRepository(Collection).findOne({ where: { id } });
      if (!collection) throw new NotFoundException('Collection not found');
      if (collection.ownerId !== user.id) throw new ForbiddenException();

      const result = await trx
        .getRepository(CollectionComponent)
        .delete({ collectionId: id, componentId });
      if (result.affected) {
        await trx.getRepository(Collection).decrement({ id }, 'componentsCount', 1);
      }
    });
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const collection = await this.collections.findOne({ where: { id } });
    if (!collection) throw new NotFoundException('Collection not found');
    if (collection.ownerId !== user.id) throw new ForbiddenException();
    await this.collections.softRemove(collection);
  }
}
