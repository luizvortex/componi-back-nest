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
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SkipConsentCheck } from '../../common/decorators/skip-consent-check.decorator';
import { AuditService } from '../../common/audit/audit.service';
import type { AuthUser } from '../../common/types/auth-user.type';
import { AccountPrivacyService } from './account-privacy.service';
import { ConsentService } from './consent.service';
import { AcceptConsentDto } from './dto/accept-consent.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly service: UsersService,
    private readonly privacy: AccountPrivacyService,
    private readonly consent: ConsentService,
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

  /** LGPD Art. 18 V — data portability. Must stay reachable regardless of consent. */
  @SkipConsentCheck()
  @Get('me/export')
  @Header('Content-Disposition', 'attachment; filename="componi-export.json"')
  exportMe(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.privacy.exportData(AuditService.contextFromRequest(user, req));
  }

  /** LGPD Art. 18 VI — erasure. Must stay reachable regardless of consent. */
  @SkipConsentCheck()
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMe(@CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.privacy.deleteAccount(AuditService.contextFromRequest(user, req));
  }

  /** LGPD Art. 8º — current consent status; used by the frontend prompt. */
  @SkipConsentCheck()
  @Get('me/consent')
  getConsent(@CurrentUser() user: AuthUser) {
    return this.consent.getStatus(user.id);
  }

  /** Records acceptance of the server-side current privacy/terms versions. */
  @SkipConsentCheck()
  @Post('me/consent')
  acceptConsent(@CurrentUser() user: AuthUser, @Body() dto: AcceptConsentDto) {
    return this.consent.accept(user.id, dto);
  }
}
