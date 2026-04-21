import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export const COMPONENT_CODE_MAX_BYTES = 200_000;
export const MAX_DEPENDENCIES = 50;
export const MAX_DEPENDENCIES_JSON_BYTES = 8_000;
export const MAX_TAG_SLUGS = 8;

const SEMVER_RANGE = /^[\^~]?\d+(\.\d+){0,2}([-+][\w.-]+)?$|^\*$|^latest$/;

@ValidatorConstraint({ name: 'dependenciesShape', async: false })
export class DependenciesConstraint implements ValidatorConstraintInterface {
  private message = '';

  validate(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value !== 'object' || Array.isArray(value)) {
      this.message = 'dependencies must be a flat object';
      return false;
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_DEPENDENCIES) {
      this.message = `dependencies cannot exceed ${MAX_DEPENDENCIES} entries`;
      return false;
    }
    if (Buffer.byteLength(JSON.stringify(value)) > MAX_DEPENDENCIES_JSON_BYTES) {
      this.message = `dependencies serialized size exceeds ${MAX_DEPENDENCIES_JSON_BYTES} bytes`;
      return false;
    }
    for (const [pkg, range] of entries) {
      if (typeof range !== 'string' || range.length > 30 || !SEMVER_RANGE.test(range)) {
        this.message = `invalid version range for "${pkg}"`;
        return false;
      }
      if (pkg.length > 80 || !/^(@[a-z0-9-_.]+\/)?[a-z0-9-_.]+$/i.test(pkg)) {
        this.message = `invalid package name "${pkg}"`;
        return false;
      }
    }
    return true;
  }

  defaultMessage(_args: ValidationArguments): string {
    return this.message || 'invalid dependencies';
  }
}
