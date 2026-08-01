export type Preset = {
  slug: string;
  name: string;
  defaultBody: string;
  createdAt: number;
};

export type SubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  ua: string;
  createdAt: number;
};

export type ScheduledSend = {
  id: string;
  slug: string;
  body: string;
  /** Epoch in millisecondi. */
  sendAt: number;
  messageId: string;
};

export type IconSize = 192 | 512;

/** Le due icone di un preset, in base64 senza prefisso data URI. */
export type IconSet = Record<IconSize, string>;
