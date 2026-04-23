import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user.type';
import { AccountPrivacyService } from './account-privacy.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly service: UsersService,
    private readonly privacy: AccountPrivacyService,
  ) {}

  @Public()
  @Get(':username')
  findByUsername(@Param('username') username: string) {
    return this.service.findByUsername(username);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserDto) {
    return this.service.update(user.id, dto);
  }

  /** LGPD Art. 18 V — data portability. */
  @Get('me/export')
  @Header('Content-Disposition', 'attachment; filename="componi-export.json"')
  exportMe(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.privacy.exportData(AuditService.contextFromRequest(user, req));
  }

  /** LGPD Art. 18 VI — erasure. Irreversible anonymization. */
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMe(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.privacy.deleteAccount(AuditService.contextFromRequest(user, req));
  }
}
