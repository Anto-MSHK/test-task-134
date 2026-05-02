import { DomainEventDto } from '../events/dto/domain-event.dto';

export interface EventPublisher {
  publish(event: DomainEventDto): Promise<void>;
}
