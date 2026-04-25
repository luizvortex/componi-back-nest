import { IsBoolean, IsOptional } from 'class-validator';

export class AcceptConsentDto {
  @IsOptional()
  @IsBoolean()
  acceptPrivacy?: boolean;

  @IsOptional()
  @IsBoolean()
  acceptTerms?: boolean;
}
