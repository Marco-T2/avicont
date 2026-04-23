import { SetMetadata } from '@nestjs/common';

export const FEATURE_FLAG_KEY = 'feature_flag';

/**
 * Decorator to require a feature flag to be enabled
 * Usage: @RequireFeature('my_feature')
 */
export const RequireFeature = (featureKey: string) => SetMetadata(FEATURE_FLAG_KEY, featureKey);
