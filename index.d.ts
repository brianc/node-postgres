export function parse(connectionString: string): ConnectionOptions;

export interface ConnectionOptions {
  host: string | null;
  password: string | null;
  user: string | null;
  port: number | null;
  database: string | null;
  client_encoding: string | null;
  ssl: boolean | null;

  application_name: string | null;
  fallback_application_name: string | null;
}
