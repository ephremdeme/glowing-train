export class RetryableAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableAdapterError';
  }
}

export class NonRetryableAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableAdapterError';
  }
}

export class FeatureDisabledError extends Error {
  constructor(feature: string) {
    super(`${feature} is disabled by feature flag.`);
    this.name = 'FeatureDisabledError';
  }
}
