import { SetMetadata } from '@nestjs/common';

export const IS_OPTIONAL_AUTH_KEY = 'isOptionalAuth';

/**
 * Marks a route as accessible without authentication, but if a valid bearer
 * token is present the guard still populates `req.user` so handlers can
 * tailor responses to logged-in viewers (e.g., include private components
 * authored by the caller in a list).
 */
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);
