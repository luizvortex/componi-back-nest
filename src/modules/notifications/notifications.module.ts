import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Notification } from '../../database/entities/notification.entity';
import { QUEUE_NOTIFICATIONS } from '../../common/queue/queue.constants';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    BullModule.registerQueue({ name: QUEUE_NOTIFICATIONS }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
