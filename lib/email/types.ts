export interface EmailRecipient {
  id?: string;
  email: string;
  unsubscribeToken?: string;
}

export interface EmailMessage {
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string>;
}

export interface SendResult {
  ok: boolean;
  error?: string;
  permanent?: boolean;
  quotaExceeded?: boolean;
}

export interface EmailProvider {
  readonly name: string;
  isConfigured(): boolean;
  send(recipient: EmailRecipient, message: EmailMessage): Promise<SendResult>;
  close?(): Promise<void>;
}

export interface ProviderBudgetStatus {
  providerName: string;
  configured: boolean;
  dailyLimit: number;
  sentToday: number;
  remainingBudget: number;
}

export interface HubStory {
  id: string;
  title: string;
  summary: string | null;
  image: string | null;
  sourceNames: string[];
  totalSources: number;
  hubUrl: string;
}

export interface DailyNewsletterOptions {
  dryRun?: boolean;
  testRecipients?: string[];
  supabase?: any;
}

export interface DailyNewsletterResult {
  message: string;
  sent: number;
  failed: number;
  deferred: number;
  providerCounts: Record<string, number>;
  storiesCount: number;
  dryRun: boolean;
  plannedSplit?: Record<string, number>;
}
