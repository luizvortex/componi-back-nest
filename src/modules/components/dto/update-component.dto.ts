import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateComponentDto } from './create-component.dto';

/** Metadata-only updates — publishing new code goes through the versions module. */
export class UpdateComponentDto extends PartialType(
  OmitType(CreateComponentDto, ['code', 'dependencies'] as const),
) {}
