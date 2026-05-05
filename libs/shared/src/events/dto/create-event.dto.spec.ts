import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateEventDto } from './create-event.dto';

describe(CreateEventDto.name, () => {
  it('accepts a valid order.created payload', async () => {
    const dto = plainToInstance(CreateEventDto, {
      eventType: 'order.created',
      occurredAt: '2026-05-02T11:00:00.000Z',
      recipient: {
        telegramChatId: '123456789',
      },
      payload: {
        orderId: 'ORD-1001',
        amount: 129.99,
        currency: 'USD',
      },
    });

    await expect(validate(dto, validationOptions)).resolves.toHaveLength(0);
  });

  it('rejects missing required fields and extra properties', async () => {
    const dto = plainToInstance(CreateEventDto, {
      recipient: {},
      payload: {
        orderId: 'ORD-1001',
      },
      unexpected: true,
    });

    const errors = await validate(dto, validationOptions);
    const errorProperties = errors.map((error) => error.property);

    expect(errorProperties).toEqual(expect.arrayContaining(['eventType', 'unexpected']));
    expect(errors.find((error) => error.property === 'recipient')?.children?.[0]?.property).toBe(
      'telegramChatId',
    );
  });
});

const validationOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
};
