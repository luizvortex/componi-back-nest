import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateComponentDto } from './create-component.dto';

/**
 * All fields are optional — designed for auto-save from the inline editor.
 * Code is updated in-place on the current version (no new version is created).
 * Only works on components where isDraft = true; use the versions endpoint for
 * post-publish code iterations.
 */
export class SaveDraftDto extends PartialType(
  OmitType(CreateComponentDto, ['isDraft'] as const),
) {}
