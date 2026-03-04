export interface StatsSchema {
  name: string;
  tables?: Array<{ name: string; columns?: any[] }>;
}

export interface StatsResponse {
  schemas?: StatsSchema[];
  size?: string;
  connections?: number;
  [key: string]: unknown;
}
