import {
  listRetryableRequests,
  processStoredOrder,
} from "../../functions/_lib/order-intake";
import type {
  OrderIntakeEnv,
  OrderQueueMessage,
} from "../../functions/_lib/order-intake";

type QueueMessage = {
  body: OrderQueueMessage;
  ack(): void;
  retry(options?: {
    delaySeconds?: number;
  }): void;
};

type QueueBatch = {
  messages: QueueMessage[];
};

function retryDelaySeconds(
  requestId: string,
) {
  let seed = 0;

  for (const character of requestId) {
    seed =
      (seed * 31 +
        character.charCodeAt(0)) %
      120;
  }

  return 60 + seed;
}

async function processQueueMessage(
  message: QueueMessage,
  env: OrderIntakeEnv,
) {
  const requestId =
    message.body?.requestId;

  if (!requestId) {
    message.ack();
    return;
  }

  const result =
    await processStoredOrder(
      env,
      requestId,
    );

  if ("data" in result || !result.transient) {
    message.ack();
    return;
  }

  message.retry({
    delaySeconds:
      retryDelaySeconds(requestId),
  });
}

export default {
  async queue(
    batch: QueueBatch,
    env: OrderIntakeEnv,
  ) {
    await Promise.all(
      batch.messages.map((message) =>
        processQueueMessage(
          message,
          env,
        ),
      ),
    );
  },

  async scheduled(
    controller: unknown,
    env: OrderIntakeEnv,
  ) {
    void controller;

    const requestIds =
      await listRetryableRequests(
        env,
        25,
      );

    await Promise.all(
      requestIds.map((requestId) =>
        processStoredOrder(
          env,
          requestId,
        ),
      ),
    );
  },
};
