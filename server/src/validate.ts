import {
  incomingClientMessageSchema,
  incomingHostMessageSchema,
  parseRawMessage,
  type IncomingClientMessage,
  type IncomingHostMessage,
} from '@chaos-parcel/shared';
import type { ConnectionRole } from '@chaos-parcel/shared';

export function validateIncomingMessage(
  raw: string,
  role: ConnectionRole,
): IncomingClientMessage | IncomingHostMessage {
  const data = parseRawMessage(raw);
  if (role === 'host') {
    return incomingHostMessageSchema.parse(data);
  }
  return incomingClientMessageSchema.parse(data);
}
