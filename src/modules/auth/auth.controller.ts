import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser } from '../../common/types/auth-user.type';
import { AuthService } from './auth.service';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Returns the current user profile, provisioning it from Supabase claims if missing. */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.getOrProvisionProfile(user);
  }

  @Public()
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
