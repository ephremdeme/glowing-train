import { FundingConfirmationRepository } from './repository.js';
import type { FundingConfirmedInput, FundingResult } from './types.js';

export class FundingConfirmationService {
  constructor(private readonly repository: FundingConfirmationRepository) {}

  async processFundingConfirmed(event: FundingConfirmedInput): Promise<FundingResult> {
    const route = await this.repository.findRouteMatch({
      chain: event.chain,
      token: event.token,
      depositAddress: event.depositAddress
    });

    if (!route) {
      return { status: 'route_not_found' };
    }

    return this.repository.applyFundingConfirmation({ match: route, event });
  }
}
