import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Component } from '../../database/entities/component.entity';
import { ComponentVersion } from '../../database/entities/component-version.entity';
import type { AuthUser } from '../../common/types/auth-user.type';
import { PublishVersionDto } from './dto/publish-version.dto';

@Injectable()
export class VersionsService {
  constructor(
    @InjectRepository(Component) private readonly components: Repository<Component>,
    @InjectRepository(ComponentVersion) private readonly versions: Repository<ComponentVersion>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async list(componentId: string, user?: AuthUser): Promise<ComponentVersion[]> {
    const component = await this.components.findOne({ where: { id: componentId } });
    if (!component) throw new NotFoundException('Component not found');
    if (!component.isPublic && component.authorId !== user?.id) {
      throw new NotFoundException('Component not found');
    }
    return this.versions.find({
      where: { componentId },
      order: { version: 'DESC' },
    });
  }

  async publish(
    componentId: string,
    user: AuthUser,
    dto: PublishVersionDto,
  ): Promise<ComponentVersion> {
    return this.dataSource.transaction(async (trx) => {
      const component = await trx.getRepository(Component).findOne({ where: { id: componentId } });
      if (!component) throw new NotFoundException('Component not found');
      if (component.authorId !== user.id) throw new ForbiddenException();

      const latest = await trx
        .getRepository(ComponentVersion)
        .createQueryBuilder('v')
        .where('v.componentId = :id', { id: componentId })
        .orderBy('v.version', 'DESC')
        .getOne();

      const nextVersion = (latest?.version ?? 0) + 1;
      const version = trx.getRepository(ComponentVersion).create({
        componentId,
        version: nextVersion,
        code: dto.code,
        dependencies: dto.dependencies ?? {},
        entryFile: dto.entryFile ?? null,
        changelog: dto.changelog ?? null,
      });
      const saved = await trx.getRepository(ComponentVersion).save(version);

      component.currentVersionId = saved.id;
      await trx.getRepository(Component).save(component);
      return saved;
    });
  }

  async findOne(
    componentId: string,
    versionNumber: number,
    user?: AuthUser,
  ): Promise<ComponentVersion> {
    const component = await this.components.findOne({ where: { id: componentId } });
    if (!component) throw new NotFoundException('Component not found');
    if (!component.isPublic && component.authorId !== user?.id) {
      throw new NotFoundException('Component not found');
    }
    const version = await this.versions.findOne({
      where: { componentId, version: versionNumber },
    });
    if (!version) throw new NotFoundException('Version not found');
    return version;
  }
}
