import { DomainEventDto } from '../events/dto/domain-event.dto';

export interface NotificationSender {
  send(event: DomainEventDto): Promise<void>;
}
